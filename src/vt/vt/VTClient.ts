import { clone } from "~/vt/lib/clone.ts";
import VTMeta from "~/vt/vt/VTMeta.ts";
import { pull } from "~/vt/lib/pull.ts";
import { push } from "~/vt/lib/push.ts";
import { status, type StatusResult } from "~/vt/lib/status.ts";
import { denoJson, vtIgnore } from "~/vt/vt/editor/mod.ts";
import { join } from "@std/path";
import { checkout, type CheckoutResult } from "~/vt/lib/checkout.ts";
import { isDirty } from "~/vt/lib/utils.ts";
import ValTown from "@valtown/sdk";
import sdk, { branchIdToBranch, getLatestVersion } from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME, META_IGNORE_FILE_NAME } from "~/consts.ts";

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
    version = -1,
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

    // If they choose -1 as the version then change to use the most recent
    // version
    version = version === -1
      ? (await sdk.projects.branches.retrieve(projectId, branch.id)).version
      : version;

    const vt = new VTClient(rootPath);

    try {
      await Deno.stat(vt.getMeta().getMetaFilePath());
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        await vt.getMeta().saveState({
          project: { id: projectId },
          branch: { id: branch.id, version: version },
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
   * @returns {AsyncGenerator<StatusResult>} An async generator that yields `StatusResult` objects for each change.
   */
  public async *watch(
    debounceDelay: number = 600,
  ): AsyncGenerator<StatusResult> {
    // Do an initial push
    yield await this.push();

    // Track the last time we pushed
    let lastPushed = 0;

    // Listen for termination signals to perform cleanup
    for (const signal of ["SIGINT", "SIGTERM"]) {
      Deno.addSignalListener(signal as Deno.Signal, () => {
        console.log("Stopping watch process...");
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
    const config = await this.getMeta().loadState();

    // Do the clone using the configuration
    await clone({
      targetDir,
      projectId: config.project.id,
      branchId: config.branch.id,
      version: config.branch.version,
      gitignoreRules: await this.getMeta().loadGitignoreRules(),
    });
  }

  /**
   * Get the status of files in the project directory compared to the Val Town
   * project.
   *
   * @param {Object} options - Options for status check
   * @param {string} [options.branchId] - Optional branch ID to check against. Defaults to current branch.
   * @returns {Promise<StatusResult>} A StatusResult object containing categorized files.
   */
  public async status(
    { branchId }: { branchId?: string } = {},
  ): Promise<StatusResult> {
    const state = await this.getMeta().loadState();

    // Use provided branchId or fall back to the current branch from config
    const targetBranchId = branchId || state.branch.id;

    return status({
      targetDir: this.rootPath,
      projectId: state.project.id,
      branchId: targetBranchId,
      version: await getLatestVersion(state.branch.id, targetBranchId),
      gitignoreRules: await this.getMeta().loadGitignoreRules(),
    });
  }

  /**
   * Pull val town project into a vt directory. Updates all the files in the
   * directory. If the contents are dirty (files have been updated but not
   * pushed) then this fails.
   *
   * @returns {Promise<void>} Resolves once pull complete
   */
  public async pull(): Promise<void> {
    const state = await this.getMeta().loadState();

    state.branch.version = await getLatestVersion(
      state.project.id,
      state.branch.id,
    );

    await pull({
      targetDir: this.rootPath,
      projectId: state.project.id,
      branchId: state.branch.id,
      version: state.branch.version,
      gitignoreRules: await this.getMeta().loadGitignoreRules(),
    });

    await this.getMeta().saveState(state);
  }

  /**
   * Push changes from the local directory to the Val Town project.
   *
   * @param {Object} options - Optional parameters
   * @param {StatusResult} options.statusResult - Optional pre-fetched StatusResult to use
   * @returns {Promise<StatusResult>} The StatusResult after pushing
   */
  public async push(
    options?: { statusResult?: StatusResult },
  ): Promise<StatusResult> {
    const state = await this.getMeta().loadState();

    const statusResult = await push({
      targetDir: this.rootPath,
      projectId: state.project.id,
      branchId: state.branch.id,
      gitignoreRules: await this.getMeta().loadGitignoreRules(),
      statusResult: options?.statusResult,
    });

    await this.getMeta().saveState({
      project: { id: state.project.id },
      branch: {
        id: state.branch.id,
        version: await getLatestVersion(state.project.id, state.branch.id),
      },
    });

    return statusResult;
  }

  /**
   * Check out a different branch of the project.
   *
   * @param {string} branchName The name of the branch to check out to
   * @param {Object} options - Optional parameters
   * @param {string} options.forkedFrom If provided, create a new branch with branchName, forking from this branch
   * @param {StatusResult} options.statusResult - Optional pre-fetched StatusResult to use
   * @returns {Promise<CheckoutResult>}
   */
  public async checkout(
    branchName: string,
    options?: { forkedFrom?: string; statusResult?: StatusResult },
  ): Promise<CheckoutResult> {
    const config = await this.getMeta().loadState();
    const currentBranchId = config.branch.id;

    // Get files that were newly created but not yet committed
    const statusResult = options?.statusResult || await this.status();
    const created = statusResult.created.map((file) => file.path);

    // We want to ignore newly created files. Adding them to the gitignore
    // rules list is a nice way to do that.
    const gitignoreRules = [
      ...(await this.getMeta().loadGitignoreRules()),
      ...created,
    ];

    let result: CheckoutResult;

    if (options?.forkedFrom) {
      // Create a new branch from the specified source
      const sourceVersion = await getLatestVersion(
        config.project.id,
        options.forkedFrom,
      );

      result = await checkout({
        targetDir: this.rootPath,
        projectId: config.project.id,
        forkedFromId: options.forkedFrom,
        name: branchName,
        gitignoreRules,
        version: sourceVersion,
      });

      config.branch.id = result.toBranch.id;
      config.branch.version = result.toBranch.version;
    } else {
      // Check out existing branch
      const checkoutBranch = await branchIdToBranch(
        config.project.id,
        branchName,
      );

      const latestVersion = await getLatestVersion(
        config.project.id,
        checkoutBranch.id,
      );

      result = await checkout({
        targetDir: this.rootPath,
        projectId: config.project.id,
        branchId: checkoutBranch.id,
        fromBranchId: currentBranchId,
        gitignoreRules: gitignoreRules,
        version: latestVersion,
      });

      config.branch = { id: result.toBranch.id, version: latestVersion };
    }

    // Update the config with the new branch
    await this.getMeta().saveState(config);

    return result;
  }

  /**
   * Check if the working directory has uncommitted changes.
   *
   * @param {Object} options - Optional parameters
   * @param {StatusResult} options.statusResult - Optional pre-fetched StatusResult to use
   * @returns {Promise<boolean>} True if there are uncommitted changes
   */
  public async isDirty(
    options?: { statusResult?: StatusResult },
  ): Promise<boolean> {
    const statusResult = options?.statusResult || await this.status();
    return isDirty(statusResult);
  }
}
