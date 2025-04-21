import { clone } from "~/vt/lib/clone.ts";
import { debounce, delay } from "@std/async";
import VTMeta from "~/vt/vt/VTMeta.ts";
import { pull } from "~/vt/lib/pull.ts";
import { push } from "~/vt/lib/push.ts";
import { denoJson, vtIgnore } from "~/vt/vt/editor/mod.ts";
import { join, relative } from "@std/path";
import {
  type BaseCheckoutParams,
  type BranchCheckoutParams,
  checkout,
  type CheckoutResult,
  type ForkCheckoutParams,
} from "~/vt/lib/checkout.ts";
import sdk, { branchNameToBranch, getLatestVersion, user } from "~/sdk.ts";
import {
  DEFAULT_BRANCH_NAME,
  FIRST_VERSION_NUMBER,
  META_FOLDER_NAME,
  META_IGNORE_FILE_NAME,
} from "~/consts.ts";
import { status } from "~/vt/lib/status.ts";
import type { ItemStatusManager } from "~/vt/lib/ItemStatusManager.ts";
import { exists } from "@std/fs";
import ValTown from "@valtown/sdk";
import { dirIsEmpty } from "~/utils.ts";
import VTConfig from "~/vt/VTConfig.ts";
import { remix } from "~/vt/lib/remix.ts";
import type { ProjectPrivacy } from "~/types.ts";
import { create } from "~/vt/lib/create.ts";

/**
 * The VTClient class is an abstraction on a VT directory that exposes
 * functionality for git command executation on the folder.
 *
 * With a VTClient you can do things like clone a val town project, or
 * pull/push a val town project.
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
   * @returns {Promise<void>}
   */
  public async addEditorFiles(
    options?: { noDenoJson?: boolean },
  ): Promise<void> {
    // Always add the vt ignore file
    const metaIgnoreFile = join(this.rootPath, META_IGNORE_FILE_NAME);
    if (!await exists(metaIgnoreFile)) {
      await Deno.writeTextFile(
        join(this.rootPath, META_IGNORE_FILE_NAME),
        vtIgnore.text,
      );
    }

    // Add deno.json unless explicitly disabled
    const denoJsonFile = join(this.rootPath, "deno.json");
    if (!(options?.noDenoJson) && !await exists(denoJsonFile)) {
      await Deno.writeTextFile(
        denoJsonFile,
        JSON.stringify(denoJson, undefined, 2),
      );
    }
  }

  /**
   * Initialize the VT instance for a project. You always have to be checked
   * out to *something* so init also takes an initial branch.
   *
   * @param {string} rootPath The root path where the VT instance will be initialized
   * @param args The arguments for initialization
   * @param {string} args.rootPath The root path of the VT directory
   * @param {string} args.username The username of the project owner
   * @param {number} args.version The version of the project to initialize. -1 for latest version
   * @param {string} args.projectName The name of the project
   * @param {string} args.branchName The branch name to initialize
   * @returns {Promise<VTClient>} A new VTClient instance
   */
  public static async init({
    rootPath,
    username,
    projectName,
    version,
    branchName = DEFAULT_BRANCH_NAME,
  }: {
    rootPath: string;
    username: string;
    projectName: string;
    version?: number;
    branchName?: string;
  }): Promise<VTClient> {
    const projectId = await sdk.alias.username.projectName.retrieve(
      username,
      projectName,
    )
      .then((project) => project.id)
      .catch(() => {
        throw new Error("Project not found");
      });

    const branch = await branchNameToBranch(projectId, branchName);

    version = version ??
      (await sdk.projects.branches.retrieve(projectId, branch.id)).version;

    const vt = new VTClient(rootPath);

    await vt.getMeta().saveVtState({
      project: { id: projectId },
      branch: { id: branch.id, version: version },
    });

    return vt;
  }

  /**
   * Static method to create a VTClient instance from an existing project
   * directory. Loads the configuration from the `.vt` folder in the given
   * directory.
   *
   * @param {string} rootPath The root path of the existing project.
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
   * @param {number} debounceDelay - Time in milliseconds to wait between pushes (default: 1000ms)
   * @param {number} gracePeriod - Time in milliseconds to wait after a push before processing new events (default: 250ms)
   * @returns {Promise<void>} A promise that resolves when the watcher is stopped.
   */
  public async watch(
    callback: (fileState: ItemStatusManager) => void | Promise<void>,
    debounceDelay: number = 1000,
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
        const fileState = await this.push();
        if (fileState.changes() > 0) {
          await callback(fileState);
        }
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
          // The file no longer exists at the time of uploading. It could've
          // just been a temporary file, but since it no longer exists it
          // isn't our problem.
        } else if (e instanceof ValTown.APIError && e.status === 404) {
          // The val we're trying to update doesn't exist on the server. This
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
   * Create a new Val Town project and initialize a VT instance for it.
   *
   * @param {Object} options - The options for creating a new project
   * @param {string} options.rootPath - The root path where the VT instance will be initialized
   * @param {string} options.projectName - The name of the project to create
   * @param {string} options.username - The username of the project owner
   * @param {'public' | 'private' | 'unlisted'} options.privacy - The privacy setting for the project
   * @param {string} [options.description] - Optional description for the project
   * @returns {Promise<VTClient>} A new VTClient instance
   */
  public static async create({
    rootPath,
    projectName,
    username,
    privacy,
    description,
  }: {
    rootPath: string;
    projectName: string;
    username: string;
    privacy: "public" | "private" | "unlisted";
    description?: string;
  }): Promise<VTClient> {
    await assertSafeDirectory(rootPath);

    // First create the project
    const { newProjectId } = await create({
      sourceDir: rootPath,
      projectName,
      privacy,
      description,
    });

    // Get the project branch
    const branch = await branchNameToBranch(newProjectId, DEFAULT_BRANCH_NAME);
    if (!branch) throw new Error(`Branch "${DEFAULT_BRANCH_NAME}" not found`);

    // Clone and return the VTClient
    return await VTClient.clone({
      username,
      projectName,
      rootPath,
    });
  }

  /**
   * Remix an existing Val Town project and initialize a VT instance for it.
   *
   * @param {Object} options - The options for remixing a project
   * @param {string} options.rootPath - The root path where the VT instance will be initialized
   * @param {string} options.srcProjectUsername - The username of the source project owner
   * @param {string} options.srcProjectName - The name of the source project to remix
   * @param {string} [options.srcBranchName] - The branch name of the source project to remix (defaults to main)
   * @param {string} options.dstProjectName - The name for the new remixed project
   * @param {'public' | 'private' | 'unlisted'} options.dstProjectPrivacy - The privacy setting for the new project
   * @param {string} [options.description] - Optional description for the new project
   * @returns {Promise<VTClient>} A new VTClient instance
   */
  public static async remix({
    rootPath,
    srcProjectUsername,
    srcProjectName,
    srcBranchName = DEFAULT_BRANCH_NAME,
    dstProjectName,
    dstProjectPrivacy,
    description,
  }: {
    rootPath: string;
    srcProjectUsername: string;
    srcProjectName: string;
    srcBranchName?: string;
    dstProjectName: string;
    dstProjectPrivacy?: ProjectPrivacy;
    description?: string;
  }): Promise<VTClient> {
    await assertSafeDirectory(rootPath);

    // Get the source project ID from username and project name
    const sourceProject = await sdk.alias.username.projectName.retrieve(
      srcProjectUsername,
      srcProjectName,
    );

    // Remix the project
    const { toProjectId, toVersion } = await remix({
      targetDir: rootPath,
      srcProjectId: sourceProject.id,
      srcBranchId: srcBranchName,
      projectName: dstProjectName,
      description,
      privacy: dstProjectPrivacy,
    });

    // Get the project branch
    const branch = await branchNameToBranch(toProjectId, DEFAULT_BRANCH_NAME);
    if (!branch) throw new Error(`Branch "${DEFAULT_BRANCH_NAME}" not found`);

    // Return the new VTClient
    return VTClient.init({
      projectName: dstProjectName,
      username: user.username!,
      rootPath,
      version: toVersion,
      branchName: branch.name,
    });
  }

  /**
   * Clone a Val Town project into a directory.
   *
   * @param {object} params - Clone parameters
   * @param {string} params.rootPath - The directory to clone the project into
   * @param {string} params.username - The username of the project owner
   * @param {string} params.projectName - The name of the project to clone
   * @param {number} [params.version] - Optional specific version to clone, defaults to latest
   * @param {string} [params.branchName] - Optional branch name to clone, defaults to main
   * @returns {Promise<VTClient>} A new VTClient instance for the cloned project
   */
  public static async clone({
    rootPath,
    username,
    projectName,
    version,
    branchName = DEFAULT_BRANCH_NAME,
  }: {
    rootPath: string;
    username: string;
    projectName: string;
    version?: number;
    branchName?: string;
  }): Promise<VTClient> {
    await assertSafeDirectory(rootPath);

    const vt = await VTClient.init({
      rootPath,
      username,
      projectName,
      version,
      branchName,
    });

    await vt.getMeta().doWithVtState(async (config) => {
      // Do the clone using the configuration
      await clone({
        targetDir: rootPath,
        projectId: config.project.id,
        branchId: config.branch.id,
        version: config.branch.version,
        gitignoreRules: await vt.getMeta().loadGitignoreRules(),
      });
    });

    return vt;
  }

  /**
   * Delete the val town project.
   */
  public async delete(): Promise<void> {
    // Don't need to use doWithConfig since the config will get distructed
    const vtState = await this.getMeta().loadVtState();

    // Delete the project
    await sdk.projects.delete(vtState.project.id);

    // De-init the directory
    await Deno.remove(
      join(this.rootPath, META_FOLDER_NAME),
      { recursive: true },
    );
  }

  /**
   * Get the status of files in the project directory compared to the Val Town
   * project.
   *
   * @param {Object} options - Options for status check
   * @param {string} [options.branchId] - Optional branch ID to check against. Defaults to current branch.
   * @returns {Promise<FileStateChanges>} A StatusResult object containing categorized files.
   */
  public async status(
    { branchId }: { branchId?: string } = {},
  ): Promise<ItemStatusManager> {
    return await this.getMeta().doWithVtState(async (vtState) => {
      // Use provided branchId or fall back to the current branch from state
      const targetBranchId = branchId || vtState.branch.id;

      const { itemStateChanges } = await status({
        targetDir: this.rootPath,
        projectId: vtState.project.id,
        branchId: targetBranchId,
        gitignoreRules: await this.getMeta().loadGitignoreRules(),
        version: await getLatestVersion(vtState.project.id, targetBranchId),
      });

      return itemStateChanges;
    });
  }

  /**
   * Pull val town project into a vt directory. Updates all the files in the
   * directory. If the contents are dirty (files have been updated but not
   * pushed) then this fails.
   *
   * @param {Partial<Parameters<typeof pull>[0]>} options - Optional parameters for pull
   */
  public async pull(
    options?: Partial<Parameters<typeof pull>[0]>,
  ): Promise<ItemStatusManager> {
    return await this.getMeta().doWithVtState(async (vtState) => {
      const { itemStateChanges: result } = await pull({
        ...{
          targetDir: this.rootPath,
          projectId: vtState.project.id,
          branchId: vtState.branch.id,
          gitignoreRules: await this.getMeta().loadGitignoreRules(),
          version: await getLatestVersion(
            vtState.project.id,
            vtState.branch.id,
          ),
        },
        ...options,
      });

      if (options?.dryRun === false) {
        const latestVersion = await getLatestVersion(
          vtState.project.id,
          vtState.branch.id,
        );

        vtState.branch.version = latestVersion;
      }

      return result;
    });
  }

  /**
   * Push changes from the local directory to the Val Town project.
   *
   * @param {Partial<Parameters<typeof pull>[0]>} options - Optional parameters for push
   * @returns {Promise<FileStateChanges>} The StatusResult after pushing
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
              projectId: config.project.id,
              branchId: config.branch.id,
              gitignoreRules: await this.getMeta().loadGitignoreRules(),
            },
            ...options,
          });

          if (!options || options.dryRun === false) {
            config.branch.version = await getLatestVersion(
              config.project.id,
              config.branch.id,
            );
          }

          return fileStateChanges;
        },
      );
    return fileStateChanges;
  }

  /**
  * Check out a different branch of the project.
  *
  * @param {string} branchName The name of the branch to check out to
  * @param {Partial<BranchCheckoutParams | ForkCheckoutParams>} options -
 Optional parameters
  * @returns {Promise<CheckoutResult>}
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
        projectId: vtState.project.id,
        dryRun: options?.dryRun || false,
        gitignoreRules,
      };

      let result: CheckoutResult;

      // Check if we're forking from another branch
      if (options && options.forkedFromId) {
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
          vtState.project.id,
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
 * @param {string} rootPath - The path to the directory to check
 * @throws {Error} If the directory exists and is not empty
 */
async function assertSafeDirectory(rootPath: string) {
  // If the directory exists, that is only OK if it is empty
  if (await exists(rootPath) && !await dirIsEmpty(rootPath)) {
    throw new Error(
      `"${relative(Deno.cwd(), rootPath)}" already exists and is not empty`,
    );
  }
}
