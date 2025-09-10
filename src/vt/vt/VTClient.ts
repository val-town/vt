import { checkout, clone, create, remix, status } from "~/vt/lib/mod.ts";
import { debounce, delay } from "@std/async";
import VTMeta from "~/vt/vt/VTMeta.ts";
import { pull } from "~/vt/lib/pull.ts";
import { push } from "~/vt/lib/push.ts";
import { join, relative } from "@std/path";
import type {
  BaseCheckoutParams,
  BranchCheckoutParams,
  CheckoutResult,
  ForkCheckoutParams,
} from "~/vt/lib/checkout.ts";
import {
  branchNameToBranch,
  deleteVal,
  getCurrentUser,
  getLatestVersion,
  valNameToVal,
} from "~/sdk.ts";
import {
  DEFAULT_BRANCH_NAME,
  DEFAULT_EDITOR_TEMPLATE,
  FIRST_VERSION_NUMBER,
  META_FOLDER_NAME,
} from "~/consts.ts";
import { exists, walk } from "@std/fs";
import ValTown from "@valtown/sdk";
import { dirIsEmpty } from "~/utils.ts";
import VTConfig from "~/vt/VTConfig.ts";
import type { ValPrivacy } from "~/types.ts";
import type { ItemStatusManager } from "~/vt/lib/utils/ItemStatusManager.ts";
import { parseValUri } from "~/cmd/lib/utils/parsing.ts";

/**
 * The VTClient class is an abstraction on a VT directory that exposes
 * functionality for running vt library functions like "clone" or "push."
 *
 * With a VTClient you can do things like clone a Val town Val, or
 * pull/push a Val Town Val.
 *
 * @param rootPath - The root path of the VT directory
 */
export default class VTClient {
  readonly #meta: VTMeta;

  private constructor(public readonly rootPath: string) {
    this.#meta = new VTMeta(rootPath);
  }

  /**
   * Returns the VTMeta instance for this client.
   *
   * @returns The VTMeta instance.
   */
  public getMeta(): VTMeta {
    return this.#meta;
  }

  /**
   * Returns a new VTConfig object init-ed at this VTClient's rootPath.
   *
   * @returns The VTConfig instance.
   */
  public getConfig(): VTConfig {
    return new VTConfig(this.rootPath);
  }

  /**
   * Adds editor configuration files to the target directory.
   *
   * @param options Options for adding editor files
   * @param options.noDenoJson Whether to skip adding deno.json
   * @returns Adds editor configuration files to the target directory by "underlaying" a default Val town val.
   */
  public async addEditorTemplate(): Promise<void> {
    const user = await getCurrentUser();
    const { editorTemplate } = await this.getConfig().loadConfig();
    const { ownerName, valName } = parseValUri(
      editorTemplate ?? DEFAULT_EDITOR_TEMPLATE,
      user.username!,
    );
    const templateVal = await valNameToVal(
      ownerName,
      valName,
    );
    const templateBranch = await branchNameToBranch(
      templateVal.id,
      DEFAULT_BRANCH_NAME,
    );

    await clone({
      targetDir: this.rootPath,
      valId: templateVal.id,
      branchId: templateBranch.id,
      version: templateBranch.version,
      overwrite: false,
      gitignoreRules: [],
    });
  }

  /**
   * Initialize the VT instance for a val. You always have to be checked
   * out to *something* so init also takes an initial branch.
   *
   * @param {string} rootPath The root path where the VT instance will be initialized
   * @param args The arguments for initialization
   * @param {string} args.rootPath The root path of the VT directory
   * @param {string} args.username The username of the Val owner
   * @param {number} args.version The version of the Val to initialize. -1 for latest version
   * @param {string} args.valName The name of the val
   * @param {string} args.branchName The branch name to initialize
   * @returns {Promise<VTClient>} A new VTClient instance
   */
  public static async init({
    rootPath,
    username,
    valName,
    version,
    branchName = DEFAULT_BRANCH_NAME,
  }: {
    rootPath: string;
    username: string;
    valName: string;
    version?: number;
    branchName?: string;
  }): Promise<VTClient> {
    const valId = await valNameToVal(
      username,
      valName,
    )
      .then((val) => val.id)
      .catch(() => {
        throw new Error("Val not found");
      });

    const branch = await branchNameToBranch(valId, branchName);

    version = version ?? await getLatestVersion(valId, branch.id);

    const vt = new VTClient(rootPath);

    await vt.getMeta().saveVtState({
      val: { id: valId },
      branch: { id: branch.id, version: version },
    });

    return vt;
  }

  /**
   * Static method to create a VTClient instance from an existing val
   * directory. Loads the configuration from the `.vt` folder in the given
   * directory.
   *
   * @param {string} rootPath The root path of the existing val.
   * @returns {Promise<VTClient>} An instance of VTClient initialized from existing config.
   */
  public static from(rootPath: string): VTClient {
    return new VTClient(rootPath);
  }

  /**
   * Watch the root directory for changes and automatically push to Val Town
   * when files are updated locally.
   *
   * If another instance of the program is already running then this errors. A
   * lock file with the running program's PID is maintained automatically so
   * that this cannot run with multiple instances.
   *
   * @param debounceDelay - Time in milliseconds to wait between pushes (default: 1000ms)
   * @param gracePeriod - Time in milliseconds to wait after a push before processing new events (default: 250ms)
   * @returns A promise that resolves when the watcher is stopped.
   */
  public async watch(
    callback: (fileState: ItemStatusManager) => void | Promise<void>,
    debounceDelay: number = 250,
    gracePeriod: number = 250,
  ): Promise<void> {
    // Ensure there are not multiple watchers at once
    const vtState = await this.getMeta().loadVtState();
    try {
      Deno.kill(vtState.lastRun.pid);
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }

    // Do an initial push
    const firstPush = await this.push();
    if (firstPush.changes() > 0) {
      await callback(firstPush);
    }

    // Listen for termination signals to perform cleanup
    for (const signal of ["SIGINT", "SIGTERM"]) {
      Deno.addSignalListener(signal as Deno.Signal, () => {
        console.log("Stopping watch process...");
        Deno.exit(0);
      });
    }

    const watcher = Deno.watchFs(this.rootPath);

    // Track if we're currently processing changes
    let inGracePeriod = false;
    const debouncedCallback = debounce(async () => {
      // Skip if we're already in a grace period
      if (inGracePeriod) return;

      // Set grace period flag to prevent multiple executions
      inGracePeriod = true;

      try {
        // Ignore paths that were not modified since the last push, since they
        // won't need to be pushed
        const fileState = await this.push({
          gitignoreRules: [
            ...(await this.getMeta().loadGitignoreRules()),
            ...(await Array.fromAsync(walk(this.rootPath)))
              .map((entry) => entry.path),
          ],
        });
        if (fileState.changes() > 0) {
          await callback(fileState);
        }
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
          // The file no longer exists at the time of uploading. It could've
          // just been a temporary file, but since it no longer exists it
          // isn't our problem.
        } else if (e instanceof ValTown.APIError && e.status === 404) {
          // The Val we're trying to update doesn't exist on the server. This
          // is usually a result of starting a deletion and then trying to
          // delete a second time because of duplicate file system events.
        } else throw e;
      }

      // Use delay to implement the grace period
      await delay(gracePeriod);
      inGracePeriod = false;
    }, debounceDelay);

    // Process events and debounce changes
    for await (const event of watcher) {
      if (event.kind === "access") continue; // Nothing to do

      // If we're in a grace period, ignore the event
      if (inGracePeriod) continue;

      // Trigger the debounced callback when a file change is detected
      debouncedCallback();
    }
  }

  /**
   * Create a new Val Town Val and initialize a VT instance for it.
   *
   * @param options - The options for creating a new val
   * @param options.rootPath - The root path where the VT instance will be initialized
   * @param options.valName - The name of the Val to create
   * @param options.username - The username of the Val owner
   * @param options.privacy - The privacy setting for the val
   * @param [options.description] - Optional description for the val
   * @returns A new VTClient instance
   */
  public static async create({
    rootPath,
    valName,
    username,
    privacy,
    description,
    skipSafeDirCheck = false,
  }: {
    rootPath: string;
    valName: string;
    username: string;
    privacy: "public" | "private" | "unlisted";
    description?: string;
    skipSafeDirCheck: boolean;
  }): Promise<VTClient> {
    if (!skipSafeDirCheck) {
      await assertSafeDirectory(rootPath);
    }

    // If the directory exists, make a VTMeta in it, and gather the gitignore rules
    let gitignoreRules: string[] = [];
    if (await exists(rootPath)) {
      const meta = new VTMeta(rootPath);
      gitignoreRules = await meta.loadGitignoreRules();
    }

    // First create the val (this uploads it too)
    const { newValId } = await create({
      sourceDir: rootPath,
      valName,
      privacy,
      description,
      gitignoreRules,
    });

    // Get the Val branch
    const branch = await branchNameToBranch(newValId, DEFAULT_BRANCH_NAME);
    if (!branch) throw new Error(`Branch "${DEFAULT_BRANCH_NAME}" not found`);

    // Clone and return the VTClient
    return await VTClient.clone({
      username,
      valName,
      rootPath,
      skipSafeDirCheck: true, // Already checked above
    });
  }

  /**
   * Remix an existing Val Town Val and initialize a VT instance for it.
   *
   * @param options The options for remixing a val
   * @param options.rootPath The root path where the VT instance will be initialized
   * @param options.srcValUsername The username of the source Val owner
   * @param options.srcValName The name of the source Val to remix
   * @param [options.srcBranchName] The branch name of the source Val to remix (defaults to main)
   * @param options.dstValName The name for the new remixed val
   * @param ['public | 'private' | 'unlisted'} options.dstValPrivacy - The privacy setting for the new val
   * @param [options.description] Optional description for the new val
   * @returns A new VTClient instance
   */
  public static async remix({
    rootPath,
    srcValUsername,
    srcValName,
    srcBranchName = DEFAULT_BRANCH_NAME,
    dstValName,
    dstValPrivacy,
    description,
  }: {
    rootPath: string;
    srcValUsername: string;
    srcValName: string;
    srcBranchName?: string;
    dstValName: string;
    dstValPrivacy?: ValPrivacy;
    description?: string;
  }): Promise<VTClient> {
    await assertSafeDirectory(rootPath);

    const srcVal = await valNameToVal(
      srcValUsername,
      srcValName,
    );

    const { toValId, toVersion } = await remix({
      targetDir: rootPath,
      srcValId: srcVal.id,
      srcBranchId: (await branchNameToBranch(srcVal.id, srcBranchName)).id,
      valName: dstValName,
      description,
      privacy: dstValPrivacy,
    });

    const branch = await branchNameToBranch(toValId, DEFAULT_BRANCH_NAME);
    if (!branch) throw new Error(`Branch "${DEFAULT_BRANCH_NAME}" not found`);

    const user = await getCurrentUser();

    return VTClient.init({
      valName: dstValName,
      username: user.username!,
      rootPath,
      version: toVersion,
      branchName: branch.name,
    });
  }

  /**
   * Clone a Val Town Val into a directory.
   *
   * Overloaded method that allows cloning by either:
   * 1. Specifying username and valName
   * 2. Directly providing valId
   *
   * @param params Clone parameters
   * @returns A new VTClient instance for the cloned val
   */
  public static async clone(
    params:
      & ({
        rootPath: string;
        username: string;
        valName: string;
        version?: number;
        branchName?: string;
      } | {
        rootPath: string;
        valId: string;
        version?: number;
        branchName?: string;
      })
      & { skipSafeDirCheck?: boolean },
  ): Promise<VTClient> {
    if (!params.skipSafeDirCheck) {
      await assertSafeDirectory(params.rootPath);
    }

    // Determine if we're using username/valName or direct valId
    let valId: string;
    if ("valId" in params) {
      valId = params.valId;
    } else {
      // Get valId from username and valName
      const val = await valNameToVal(
        params.username,
        params.valName,
      );
      valId = val.id;
    }

    // Get or create branch
    const branchName = params.branchName || DEFAULT_BRANCH_NAME;
    const branch = await branchNameToBranch(valId, branchName);
    if (!branch) throw new Error(`Branch "${branchName}" not found`);

    // Determine version
    const version = params.version || await getLatestVersion(valId, branch.id);

    // Create VTClient instance
    const vt = new VTClient(params.rootPath);

    // Save the VT state
    await vt.getMeta().saveVtState({
      val: { id: valId },
      branch: { id: branch.id, version },
    });

    // Perform the clone
    await clone({
      targetDir: params.rootPath,
      valId: valId,
      branchId: branch.id,
      version: version,
      gitignoreRules: await vt.getMeta().loadGitignoreRules(),
    });

    return vt;
  }

  /**
   * Delete the Val town val.
   */
  public async delete(): Promise<void> {
    // Don't need to use doWithConfig since the config will get destructed
    const vtState = await this.getMeta().loadVtState();

    // Delete the val
    await deleteVal(vtState.val.id);

    // De-init the directory
    await Deno.remove(
      join(this.rootPath, META_FOLDER_NAME),
      { recursive: true },
    );
  }

  /**
   * Get the status of files in the Val directory compared to the Val Town
   * val.
   *
   * @param options - Options for status check
   * @param [options.branchId] - Optional branch ID to check against. Defaults to current branch.
   * @returns A StatusResult object containing categorized files.
   */
  public async status(
    { branchId }: { branchId?: string } = {},
  ): Promise<ItemStatusManager> {
    return await this.getMeta().doWithVtState(async (vtState) => {
      // Use provided branchId or fall back to the current branch from state
      const targetBranchId = branchId || vtState.branch.id;

      const { itemStateChanges } = await status({
        targetDir: this.rootPath,
        valId: vtState.val.id,
        branchId: targetBranchId,
        gitignoreRules: await this.getMeta().loadGitignoreRules(),
        version: await getLatestVersion(vtState.val.id, targetBranchId),
      });

      return itemStateChanges;
    });
  }

  /**
   * Pull Val town Val into a vt directory. Updates all the files in the
   * directory. If the contents are dirty (files have been updated but not
   * pushed) then this fails.
   *
   * @param options Optional parameters for pull
   */
  public async pull(
    options?: Partial<Parameters<typeof pull>[0]>,
  ): Promise<ItemStatusManager> {
    return await this.getMeta().doWithVtState(async (vtState) => {
      const { itemStateChanges: result } = await pull({
        ...{
          targetDir: this.rootPath,
          valId: vtState.val.id,
          branchId: vtState.branch.id,
          gitignoreRules: await this.getMeta().loadGitignoreRules(),
          version: await getLatestVersion(
            vtState.val.id,
            vtState.branch.id,
          ),
        },
        ...options,
      });

      if (options?.dryRun === false) {
        const latestVersion = await getLatestVersion(
          vtState.val.id,
          vtState.branch.id,
        );

        vtState.branch.version = latestVersion;
      }

      return result;
    });
  }

  /**
   * Push changes from the local directory to the Val Town val.
   *
   * @param options Optional parameters for push
   * @returns The StatusResult after pushing
   */
  public async push(
    options?: Partial<Parameters<typeof push>[0]>,
  ): Promise<ItemStatusManager> {
    const { itemStateChanges: fileStateChanges } = await this.getMeta()
      .doWithVtState(
        async (config) => {
          const fileStateChanges = await push({
            ...{
              targetDir: this.rootPath,
              valId: config.val.id,
              branchId: config.branch.id,
              gitignoreRules: await this.getMeta().loadGitignoreRules(),
            },
            ...options,
          });

          if (!options || options.dryRun === false) {
            config.branch.version = await getLatestVersion(
              config.val.id,
              config.branch.id,
            );
          }

          return fileStateChanges;
        },
      );
    return fileStateChanges;
  }

  /**
   * Check out a different branch of the val.
   *
   * @param branchName The name of the branch to check out to
   * @param options Optional parameters
   * @returns  The result of the checkout operation
   */
  public async checkout(
    branchName: string,
    options?: Partial<ForkCheckoutParams>,
  ): Promise<CheckoutResult> {
    return await this.getMeta().doWithVtState(async (vtState) => {
      const currentBranchId = vtState.branch.id;

      // Get files that were newly created but not yet committed
      const fileStateChanges = await this.status();
      const created = fileStateChanges.created.map((file) => file.path);

      // We want to ignore newly created files. Adding them to the gitignore
      // rules list is a nice way to do that.
      const gitignoreRules = [
        ...(await this.getMeta().loadGitignoreRules()),
        ...created,
      ];

      // Common checkout parameters
      const baseParams: BaseCheckoutParams = {
        targetDir: this.rootPath,
        valId: vtState.val.id,
        dryRun: options?.dryRun || false,
        gitignoreRules,
      };

      let result: CheckoutResult;

      // Check if we're forking from another branch
      if (options?.forkedFromId) {
        const forkParams: ForkCheckoutParams = {
          ...baseParams,
          forkedFromId: options.forkedFromId,
          name: branchName,
          toBranchVersion: FIRST_VERSION_NUMBER, // Version should be 1 for a new forked branch
        };

        result = await checkout(forkParams);

        if (!baseParams.dryRun) {
          if (result.toBranch) {
            vtState.branch.id = result.toBranch.id;
            vtState.branch.version = FIRST_VERSION_NUMBER; // Set version to 1 for the new branch
          }
        }
      } else {
        // Checking out an existing branch
        const checkoutBranch = await branchNameToBranch(
          vtState.val.id,
          branchName,
        );

        // Ensure that the branch existed
        if (!checkoutBranch) {
          throw new Error(`Branch "${branchName}" not found`);
        }

        const branchParams: BranchCheckoutParams = {
          ...baseParams,
          toBranchId: checkoutBranch.id,
          fromBranchId: currentBranchId,
          toBranchVersion: options?.toBranchVersion || checkoutBranch.version, // Use specified version or the branch's version
        };

        result = await checkout(branchParams);
      }

      // Don't touch the state if it's a dry run
      if (!baseParams.dryRun) {
        if (result.toBranch) {
          vtState.branch.id = result.toBranch.id;
          vtState.branch.version = result.toBranch.version; // Use the target branch's version
        }
      }

      return result;
    });
  }
}

/**
 * Ensures the specified directory is safe to use (either doesn't exist or is empty)
 *
 * @param rootPath - The path to the directory to check
 * @throws If the directory exists and is not empty
 */
export async function assertSafeDirectory(rootPath: string) {
  // If the directory exists, that is only OK if it is empty
  if (await exists(rootPath) && !await dirIsEmpty(rootPath)) {
    throw new Error(
      `"${relative(Deno.cwd(), rootPath)}" already exists and is not empty`,
    );
  }
}
