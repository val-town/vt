import { z } from "zod";

// Define the zod schema for the configuration
const ConfigSchema = z.object({
  projectId: z.string(),
  currentBranch: z.string(),
  version: z.number(),
});

// Infer the TypeScript type from the zod schema
type ConfigJsonType = z.infer<typeof ConfigSchema>;

// Now, use ConfigJsonType in the VTClient class as previously defined

import { clone } from "~/vt/lib/git/clone.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import sdk, { branchIdToName } from "~/sdk.ts";
import VTMeta from "~/vt/vt/Meta.ts";

/**
 * The VT class is an abstraction on a VT directory that exposes functionality
 * for git command executation on the folder.
 *
 * With a VT you can do things like clone a val town project, or pull/push a
 * val town project.
 */
export default class VTClient {
  private configFolder: VTMeta;

  private constructor(public readonly rootPath: string) {
    this.configFolder = new VTMeta(rootPath);
  }

  /**
   * Initialize the VT instance for a project. You always have to be checked
   * out to *something* so init also takes an initial branch.
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

    // If they choose -1 as the version then change to use the most recent version
    if (version == -1) {
      version =
        (await sdk.projects.branches.retrieve(projectId, branchId)).version;
    }

    const vt = new VTClient(rootPath);

    try {
      await Deno.stat(vt.configFolder.configFilePath);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        await vt.configFolder.saveConfig({
          projectId,
          currentBranch: branchId,
          version: version,
        });
      } else {
        console.error("Error during initialization:", error);
      }
    }

    return vt;
  }

  /**
   * Clone a val town project into a directory using the current configuration.
   *
   * @param targetDir - The directory to clone the project into.
   */
  public async clone(targetDir: string) {
    const { projectId, currentBranch, version } = await this.getConfig();

    if (!projectId || !currentBranch || version === null) {
      throw new Error("Configuration not loaded");
    }

    // Do the clone using the configuration
    await clone({
      targetDir,
      projectId,
      branchId: currentBranch,
      version,
    });
  }

  /**
   * Loads the configuration from the `.vt` folder.
   *
   * @returns {Promise<ConfigJsonType>} The vt project configuration.
   */
  public async getConfig(): Promise<ConfigJsonType> {
    const config = await this.configFolder.getConfig();
    // Validate the config using zod
    return ConfigSchema.parse(config);
  }

  /**
   * Updates the schema file in the `.vt` folder.
   * Writes the provided schema object to the schema JSON file.
   *
   * @param {ConfigJsonType} updatedSchema - The new vt project configuration.
   */
  public async updateConfig(updatedSchema: ConfigJsonType): Promise<void> {
    await this.configFolder.saveConfig(updatedSchema);
  }
}
