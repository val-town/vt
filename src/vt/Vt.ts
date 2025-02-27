import { clone } from "~/vt/lib/git/clone.ts";
import MetaFolder from "~/vt/lib/MetaFolder.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import sdk, { branchIdToName, myProjectNameToId, user } from "~/sdk.ts";

export default class VT {
  public metaFolder: MetaFolder;

  constructor(public readonly rootPath: string) {
    this.metaFolder = new MetaFolder(this);
  }

  /**
   * Clone a val town project into a directory, init the Vit directory.
   *
   * @param targetDir - The directory to clone the project into.
   * @param userName - The username of the project owner.
   * @param projectName - The name of the project to clone.
   * @param branchName - The name of the branch to clone (optional).
   * @param version - The version of the project to clone (optional).
   */
  static clone = async (
    targetDir: string,
    userName: string,
    projectName: string,
    branchName: string = DEFAULT_BRANCH_NAME,
    version?: number,
  ) => {
    // First, make sure the project belongs to the user
    if (user.username !== userName) {
      throw new Error("You can only clone your own projects");
    }

    // Convert project name to project ID
    const projectId = await myProjectNameToId(projectName);

    // Convert branch name to project ID
    const branchId = await branchIdToName(projectId, branchName);

    if (!projectId) {
      throw new Error("Project not found");
    }

    await clone(targetDir, projectId, branchId, version);
    return new VT(targetDir);
  };
}
