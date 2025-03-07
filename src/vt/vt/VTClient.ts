import { clone } from "~/vt/git/clone.ts";
import {
  CONFIG_FILE_NAME,
  DEFAULT_BRANCH_NAME,
  DEFAULT_IGNORE_PATTERNS,
  META_FOLDER_NAME,
} from "~/consts.ts";
import sdk, { branchIdToName, getLatestVersion } from "~/sdk.ts";
import VTMeta from "~/vt/vt/VTMeta.ts";
import { pull } from "~/vt/git/pull.ts";
import { status, StatusResult } from "~/vt/git/status.ts";
import { watch } from "~/vt/git/watch.ts";
import { join } from "@std/path";

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

    const branchId = await branchIdToName(projectId, branchName);

    // If they choose -1 as the version then change to use the most recent
    // version
    if (version == -1) {
      version =
        (await sdk.projects.branches.retrieve(projectId, branchId)).version;
    }

    const vt = new VTClient(rootPath);

    try {
      await Deno.stat(vt.meta.configFilePath);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        await vt.meta.saveConfig({
          projectId,
          currentBranch: branchId,
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
   * Watch the root directory for changes and automatically push to val town
   * when files are updated locally.
   */
  public async watch() {
    // Start the watcher. Then, use a custom callback so that if the .vt
    // configuration file changes, the watcher stops and starts again. That
    // way, if the current branch changes, the watcher will start watching
    // with the new branch.
    while (true) {
      const { projectId, currentBranch } = await this.meta.loadConfig();

      await watch({
        targetDir: this.rootPath,
        projectId,
        branchId: currentBranch,
        ignoreGlobs: await this.getIgnoreGlobs(),
        watchCallback: (event) => {
          if (event.paths[0] === join(META_FOLDER_NAME, CONFIG_FILE_NAME)) {
            return false; // Stop watching, restart
          }
          return true;
        },
      });
    }
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
    const { projectId, currentBranch } = await this.meta.loadConfig();

    // Use the provided pull function
    await pull({
      targetDir,
      projectId,
      branchId: currentBranch,
      version: await getLatestVersion(projectId, currentBranch),
      ignoreGlobs: await this.getIgnoreGlobs(),
    });
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
      ignoreGlobs: await this.getIgnoreGlobs(),
    });
  }
}
