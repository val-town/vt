import { clone } from "~/vt/git/clone.ts";
import { DEFAULT_BRANCH_NAME, DEFAULT_IGNORE_PATTERNS } from "~/consts.ts";
import sdk, { branchNameToId, getLatestVersion } from "~/sdk.ts";
import VTMeta from "~/vt/vt/VTMeta.ts";
import { pull } from "~/vt/git/pull.ts";
import { push } from "~/vt/git/push.ts";
import { status, StatusResult } from "~/vt/git/status.ts";
import { debounce } from "jsr:@std/async/debounce";
import { checkout } from "~/vt/git/checkout.ts";
import { isDirty } from "~/vt/git/utils.ts";
import ValTown from "@valtown/sdk";

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
  readonly meta: VTMeta;

  private constructor(public readonly rootPath: string) {
    this.meta = new VTMeta(rootPath);
  }

  /**
   * Returns the VTMeta instance for this client.
   *
   * @returns {VTMeta} The VTMeta instance.
   */
  public getMeta(): VTMeta {
    return this.meta;
  }

  /**
   * Gets the list of globs for files that should be ignored by VT.
   *
   * @returns {Promise<RegExp[]>} The list of globs to ignore.
   */
  private async getIgnoreGlobs(): Promise<string[]> {
    return [
      ...DEFAULT_IGNORE_PATTERNS,
      ...(await this.meta.loadIgnoreGlobs()),
    ];
  }

  /**
   * Initialize the VT instance for a project. You always have to be checked
   * out to *something* so init also takes an initial branch.
   *
   * @param {string} rootPath The root path where the VT instance will be initialized
   * @param {string} username The username of the project owner
   * @param {string} projectName The name of the project
   * @param {number} version The version of the project to initialize. -1 for latest version
   * @param {string} branchName The branch name to initialize
   * @returns {Promise<VTClient>} A new VTClient instance
   */
  public static async init(
    rootPath: string,
    username: string,
    projectName: string,
    version: number = -1,
    branchName: string = DEFAULT_BRANCH_NAME,
  ): Promise<VTClient> {
    const projectId = await sdk.alias.username.projectName.retrieve(
      username,
      projectName,
    )
      .then((project) => project.id)
      .catch(() => {
        throw new Error("Project not found");
      });

    const branch = await branchNameToId(projectId, branchName);

    // If they choose -1 as the version then change to use the most recent
    // version
    if (version == -1) {
      version =
        (await sdk.projects.branches.retrieve(projectId, branch.id)).version;
    }

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
      } else {
        throw error;
      }
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
   * If another instance of the program is already running then this errors. A lock file with
   * the running program's PID is maintained automatically.
   *
   * @returns {Promise<never>} A promise that never resolves, representing the ongoing watch process.
   */
  public async watch() {
    // Set the lock file at the start
    await this.meta.setLockFile();

    // Listen for termination signals to perform cleanup
    for (const signal of ["SIGINT", "SIGTERM"]) {
      Deno.addSignalListener(signal as Deno.Signal, () => {
        console.log("Stopping watch process...");
        this.meta.rmLockFile();
        Deno.exit(0);
      });
    }

    // A function that runs a push on file system changes
    const pushOnFileEvents = async () => {
      const debouncedPush = debounce(async (_event: Deno.FsEvent) => {
        try {
          await this.push(this.rootPath);
        } catch (e) {
          // Handle case where the file was deleted before we could push it
          if (e instanceof Deno.errors.NotFound) {
            // The file no longer exists at the time of uploading. It could've
            // just been a temporary file, but since it no longer exists it
            // isn't our problem.
            return;
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
            return;
          }

          // Re-throw any other errors
          throw e;
        }
      }, 300);

      const watcher = Deno.watchFs(this.rootPath);
      for await (const event of watcher) debouncedPush(event);
    };

    // Since we're only pushing now, we just need to return the pushOnFileEvents promise
    return pushOnFileEvents();
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
    const branch = await branchNameToId(project.id, DEFAULT_BRANCH_NAME);

    // Then clone it to the target directory
    await clone({
      targetDir: rootPath,
      projectId: project.id,
      branchId: branch.id,
      version: branch.version,
    });

    // Initialize VT client with the new project
    return VTClient.init(
      rootPath,
      username,
      projectName,
      branch.version,
      DEFAULT_BRANCH_NAME,
    );
  }

  /**
   * Clone val town project into a directory using the current configuration.
   *
   * @param {string} targetDir - The directory to clone the project into.
   * @returns {Promise<void>}
   */
  public async clone(targetDir: string): Promise<void> {
    const { projectId, currentBranch, version } = await this.meta.loadConfig();

    // Do the clone using the configuration
    await clone({
      targetDir,
      projectId,
      branchId: currentBranch,
      version,
      ignoreGlobs: await this.getIgnoreGlobs(),
    });
  }

  /**
   * Pull val town project into a vt directory. Updates all the files in the
   * directory. If the contents are dirty (files have been updated but not
   * pushed) then this fails.
   *
   * @param {string} targetDir - The directory to pull the project into.
   * @returns {Promise<void>}
   */
  public async pull(targetDir: string): Promise<void> {
    const config = await this.meta.loadConfig();

    config.version = await getLatestVersion(
      config.projectId,
      config.currentBranch,
    );

    // Use the provided pull function
    await pull({
      targetDir,
      projectId: config.projectId,
      branchId: config.currentBranch,
      version: config.version,
      ignoreGlobs: await this.getIgnoreGlobs(),
    });

    await this.meta.saveConfig(config);
  }

  /**
   * Get the status of files in the project directory compared to the Val Town
   * project.
   *
   * @param {string} targetDir - The directory to check status for.
   * @returns {Promise<StatusResult>} A StatusResult object containing categorized files.
   */
  public async status(targetDir: string): Promise<StatusResult> {
    const { projectId, currentBranch } = await this.meta.loadConfig();

    return status({
      targetDir,
      projectId,
      branchId: currentBranch,
      version: await getLatestVersion(projectId, currentBranch),
      ignoreGlobs: await this.getIgnoreGlobs(),
    });
  }

  /**
   * Push changes from the local directory to the Val Town project.
   *
   * @param {string} targetDir - The directory containing local changes to push.
   * @returns {Promise<void>}
   */
  public async push(targetDir: string): Promise<void> {
    const { projectId, currentBranch, version } = await this.meta.loadConfig();

    if (!projectId || !currentBranch || version === null) {
      throw new Error("Configuration not loaded");
    }

    await push({
      targetDir,
      projectId,
      branchId: currentBranch,
      ignoreGlobs: await this.getIgnoreGlobs(),
    });
  }

  /**
   * Check out a different branch of the project.
   *
   * @param {string} targetDir The directory where the checkout should happen
   * @param {string} branchName The name of the branch to check out to
   * @param {string} forkedFrom If provided, create a new branch with branchName, forking from this branch
   * @returns {Promise<void>}
   */
  public async checkout(
    targetDir: string,
    branchName: string,
    forkedFrom?: string,
  ): Promise<void> {
    const config = await this.meta.loadConfig();

    // Get meta about the branch they are checking out. They only specify the
    // name for the branch that they are checking out. So, we'll have to query
    // the id of such branch, and the current version (by default we'll switch
    // them to the newest version of a branch when they check out a new branch.
    // This is a bit different than git, but it follows our notion of "no local
    // state, val town is the source of truth")
    const checkoutBranch = await branchNameToId(config.projectId, branchName);
    const latestVersion = await getLatestVersion(
      config.projectId,
      checkoutBranch.id,
    );

    const created =
      (await this.status(targetDir).then((status) => status.created)).map(
        (file) => file.path,
      ); // We want to ignore newly created files. Adding them to the
    // ignoreGlobs list is a nice way to do that.
    const ignoreGlobs = [...(await this.getIgnoreGlobs()), ...created];

    if (forkedFrom) { // Use the signature where we create a new branch
      const sourceVersion = await getLatestVersion(
        config.projectId,
        forkedFrom,
      );
      const newBranch = await checkout({
        targetDir,
        projectId: config.projectId,
        forkedFrom,
        name: branchName,
        ignoreGlobs,
        version: sourceVersion,
      });
      config.currentBranch = newBranch.id;
      config.version = newBranch.version;
    } else { // Use the signature where we check out an existing branch
      await checkout({
        targetDir,
        projectId: config.projectId,
        branchId: checkoutBranch.id,
        ignoreGlobs,
        version: latestVersion,
      });
    }

    // Update the config with the new branch
    await this.meta.saveConfig(config);
  }

  /**
   * Check if the working directory has uncommitted changes.
   *
   * @param {string} targetDir - The directory to check for changes
   * @returns {Promise<boolean>} True if there are uncommitted changes
   */
  public async isDirty(targetDir: string): Promise<boolean> {
    return isDirty(await this.status(targetDir));
  }
}
