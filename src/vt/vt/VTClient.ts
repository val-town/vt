import { clone } from "~/vt/lib/clone.ts";
import VTMeta from "~/vt/vt/VTMeta.ts";
import { pull } from "~/vt/lib/pull.ts";
import { push } from "~/vt/lib/push.ts";
import { denoJson, vtIgnore } from "~/vt/vt/editor/mod.ts";
import { join } from "@std/path";
import {
  type BaseCheckoutParams,
  type BranchCheckoutParams,
  checkout,
  type CheckoutResult,
  type ForkCheckoutParams,
} from "~/vt/lib/checkout.ts";
import { isDirty } from "~/vt/lib/utils.ts";
import ValTown from "@valtown/sdk";
import sdk, { branchIdToBranch, getLatestVersion } from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME, META_IGNORE_FILE_NAME } from "~/consts.ts";
import { status } from "~/vt/lib/status.ts";
import type { FileState } from "~/vt/lib/FileState.ts";

/**
 * The VTClient class is an abstraction on a VT directory that exposes
 * functionality for git command executation on the folder.
 *
 * With a VTClient you can do things like clone a val town project, or
 * pull/push a val town project.
 *
 * @param {string} rootPath - The root path of the VT directory
 */
export default class VTClient {
  readonly #meta: VTMeta;

  private constructor(public readonly rootPath: string) {
    this.#meta = new VTMeta(rootPath);
  }

  /**
   * Returns the VTMeta instance for this client.
   *
   * @returns {VTMeta} The VTMeta instance.
   */
  public getMeta(): VTMeta {
    return this.#meta;
  }

  /**
   * Adds editor configuration files to the target directory.
   *
   * @param {object} options - Options for adding editor files
   * @param {boolean} options.noDenoJson - Whether to skip adding deno.json
   * @returns {Promise<void>}
   */
  public async addEditorFiles(
    options?: { noDenoJson?: boolean },
  ): Promise<void> {
    // Always add the vt ignore file
    await Deno.writeTextFile(
      join(this.rootPath, META_IGNORE_FILE_NAME),
      vtIgnore.text,
    );

    // Add deno.json unless explicitly disabled
    if (!options?.noDenoJson) {
      await Deno.writeTextFile(
        join(this.rootPath, "deno.json"),
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

    const branch = await branchIdToBranch(projectId, branchName);

    version = version ||
      (await sdk.projects.branches.retrieve(projectId, branch.id)).version;

    const vt = new VTClient(rootPath);

    try {
      await Deno.stat(vt.getMeta().configFilePath);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        await vt.getMeta().saveConfig({
          projectId,
          currentBranch: branch.id,
          version: version,
        });
      } else throw error;
    }

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
   * @param {number} debounceDelay - Time in milliseconds to wait between pushes (default: 300ms)
   * @returns {AsyncGenerator<FileStateChanges>} An async generator that yields `StatusResult` objects for each change.
   */
  public async *watch(
    debounceDelay: number = 300,
  ): AsyncGenerator<FileState> {
    // Do an initial push
    const firstPush = await this.push();
    if (firstPush.changes() > 0) yield firstPush;

    // Set the lock file at the start
    await this.getMeta().setLockFile();

    // Track the last time we pushed
    let lastPushed = 0;

    // Listen for termination signals to perform cleanup
    for (const signal of ["SIGINT", "SIGTERM"]) {
      Deno.addSignalListener(signal as Deno.Signal, () => {
        console.log("Stopping watch process...");
        this.getMeta().rmLockFile();
        Deno.exit(0);
      });
    }

    const watcher = Deno.watchFs(this.rootPath);

    // Process events and yield results
    for await (const event of watcher) {
      try {
        // Debounce - only push if enough time has elapsed since last push
        const now = Date.now();
        if (now - lastPushed < debounceDelay) continue;

        lastPushed = now; // update debouce counter
        yield await this.push(); // yields the status retreived
      } catch (e) {
        if (event.kind === "access") return; // Nothing to do

        // Handle case where the file was deleted before we could push it
        if (e instanceof Deno.errors.NotFound) {
          // The file no longer exists at the time of uploading. It could've
          // just been a temporary file, but since it no longer exists it
          // isn't our problem.
          continue;
        }

        // Handle case where the API returns a 404 Not Found error
        if (e instanceof ValTown.APIError && e.status === 404) {
          // The val we're trying to update doesn't exist on the server. This
          // is usually a result of starting a deletion and then trying to
          // delete a second time because of duplicate file system events.
          //
          // TODO: We should keep a global queue of outgoing requests and
          // intelligently notice that we have duplicate idempotent (in this
          // case deletions are) requests in the queue.
          continue;
        }

        // Re-throw any other errors
        throw e;
      }
    }
  }

  /**
   * Create a new Val Town project and initialize a VT instance for it.
   *
   * @param {string} rootPath - The root path where the VT instance will be initialized
   * @param {string} projectName - The name of the project to create
   * @param {string} username - The username of the project owner
   * @param {'public' | 'private'} privacy - The privacy setting for the project
   * @param {string} [description] - Optional description for the project
   * @returns {Promise<VTClient>} A new VTClient instance
   */
  public static async create(
    rootPath: string,
    projectName: string,
    username: string,
    privacy: "public" | "private" | "unlisted",
    description?: string,
  ): Promise<VTClient> {
    // First create the project
    const project = await sdk.projects.create({
      name: projectName,
      privacy,
      description,
    });

    // Get the project branch
    const branch = await branchIdToBranch(project.id, DEFAULT_BRANCH_NAME);
    if (!branch) throw new Error(`Branch "${DEFAULT_BRANCH_NAME}" not found`);

    // Then clone it to the target directory
    await clone({
      targetDir: rootPath,
      projectId: project.id,
      branchId: branch.id,
      version: branch.version,
    });

    // Initialize VT client with the new project
    return VTClient.init(
      {
        rootPath,
        username,
        projectName,
        version: branch.version,
        branchName: DEFAULT_BRANCH_NAME,
      },
    );
  }

  /**
   * Clone val town project into a directory using the current configuration.
   *
   * @param {string} targetDir - The directory to clone the project into.
   * @returns {Promise<void>}
   */
  public async clone(targetDir: string): Promise<void> {
    await this.getMeta().doWithConfig(async (config) => {
      // Do the clone using the configuration
      await clone({
        targetDir,
        projectId: config.projectId,
        branchId: config.currentBranch,
        version: config.version,
        gitignoreRules: await this.getMeta().loadGitignoreRules(),
      });
    });
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
  ): Promise<FileState> {
    return await this.getMeta().doWithConfig(async (config) => {
      // Use provided branchId or fall back to the current branch from config
      const targetBranchId = branchId || config.currentBranch;

      return status({
        targetDir: this.rootPath,
        projectId: config.projectId,
        branchId: targetBranchId,
        gitignoreRules: await this.getMeta().loadGitignoreRules(),
      });
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
  ): Promise<ReturnType<typeof pull>> {
    return await this.getMeta().doWithConfig(async (config) => {
      if (options?.dryRun === false) {
        config.version = await getLatestVersion(
          config.projectId,
          config.currentBranch,
        );
      }

      const result = await pull({
        ...{
          targetDir: this.rootPath,
          projectId: config.projectId,
          branchId: config.currentBranch,
          version: config.version,
          gitignoreRules: await this.getMeta().loadGitignoreRules(),
        },
        ...options,
      });

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
  ): Promise<ReturnType<typeof push>> {
    return await this.getMeta().doWithConfig(async (config) => {
      const fileStateChanges = await push({
        ...{
          targetDir: this.rootPath,
          projectId: config.projectId,
          branchId: config.currentBranch,
          gitignoreRules: await this.getMeta().loadGitignoreRules(),
        },
        ...options,
      });

      if (!options || options.dryRun === false) {
        config.version = await getLatestVersion(
          config.projectId,
          config.currentBranch,
        );
      }

      return fileStateChanges;
    });
  }

  /**
   * Check out a different branch of the project.
   *
   * @param {string} branchName The name of the branch to check out to
   * @param {Partial<BranchCheckoutParams | ForkCheckoutParams> & { fileStateChanges?: FileStateChanges }} options - Optional parameters
   * @returns {Promise<CheckoutResult>}
   */
  public async checkout(
    branchName: string,
    options?: Partial<BranchCheckoutParams | ForkCheckoutParams> & {
      fileStateChanges?: FileState;
    },
  ): Promise<CheckoutResult> {
    return await this.getMeta().doWithConfig(async (config) => {
      const currentBranchId = config.currentBranch;

      // Get files that were newly created but not yet committed
      const fileStateChanges = options?.fileStateChanges || await this.status();
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
        projectId: config.projectId,
        dryRun: options?.dryRun || false,
        gitignoreRules,
      };

      let result: CheckoutResult;

      // Check if we're forking from another branch
      if (
        options && "forkedFromId" in options &&
        typeof options.forkedFromId === "string"
      ) {
        // Creating a new branch from a specified source
        const sourceVersion = await getLatestVersion(
          config.projectId,
          options.forkedFromId,
        );

        const forkParams: ForkCheckoutParams = {
          ...baseParams,
          forkedFromId: options.forkedFromId,
          name: branchName,
          version: options.version || sourceVersion,
        };

        result = await checkout(forkParams);

        if (!baseParams.dryRun) {
          config.currentBranch = result.toBranch!.id;
          config.version = result.toBranch!.version;
        }
      } else {
        // Checking out an existing branch
        const checkoutBranch = await branchIdToBranch(
          config.projectId,
          branchName,
        );

        // Ensure that the branch existed
        if (!checkoutBranch) {
          throw new Error(`Branch "${branchName}" not found`);
        }

        const branchParams: BranchCheckoutParams = {
          ...baseParams,
          branchId: checkoutBranch.id,
          fromBranchId: currentBranchId,
          version: options?.version, // Uses latest version by default
        };

        result = await checkout(branchParams);

        if (!baseParams.dryRun) {
          config.currentBranch = result.toBranch!.id;
          config.version = branchParams.version!;
        }
      }

      return result;
    });
  }

  /**
   * Check if the working directory has uncommitted changes.
   *
   * @param {Object} options - Optional parameters
   * @param {FileStateChanges} options.fileStateChanges - Optional pre-fetched file state changes to use
   * @returns {Promise<boolean>} True if there are uncommitted changes
   */
  public async isDirty(
    options?: { fileStateChanges?: FileState },
  ): Promise<boolean> {
    const fileStateChanges = options?.fileStateChanges || await this.status();
    return isDirty(fileStateChanges);
  }
}
