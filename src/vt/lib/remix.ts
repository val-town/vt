import { doAtomically } from "~/vt/lib/utils.ts";
import { clone } from "~/vt/lib/clone.ts";
import { create } from "~/vt/lib/create.ts";
import sdk, {
  branchNameToBranch,
  getLatestVersion,
  listProjectItems,
} from "~/sdk.ts";
import { ItemStatusManager } from "~/vt/lib/ItemStatusManager.ts";
import { DEFAULT_BRANCH_NAME, DEFAULT_PROJECT_PRIVACY } from "~/consts.ts";
import type { ProjectPrivacy } from "~/types.ts";

/**
 * Result of remixing a project.
 *
 * When a project is remixed, a new project is created based on an existing project.
 * This object contains information about the newly created project and the changes
 * that were made to the local file state during the remix operation.
 */
export interface RemixResult {
  /** The ID of the newly created project */
  toProjectId: string;
  /** The version number of the newly created project */
  toVersion: number;
  /**
   * Changes made to local state during the remix process. This is roughly the
   * same result as cloning the project being remixed.
   */
  fileStateChanges: ItemStatusManager;
}

/**
 * Parameters for remixing some Val Town project to a new Val Town project.
 */
export interface RemixParams {
  /** The root directory to contain the newly remixed project. */
  targetDir: string;
  /** The id of the project to remix from. */
  srcProjectId: string;
  /** The id of the branch to remix. Defaults to the main branch. */
  srcBranchId: string;
  /** The name for the new project. */
  projectName: string;
  /** Optional project description. */
  description?: string;
  /** Privacy setting for the project. Defaults to "private". */
  privacy?: ProjectPrivacy;
  /** A list of gitignore rules. */
  gitignoreRules?: string[];
}

/**
 * Remixes an existing Val Town project to a new Val Town project.
 *
 * @param params Options for remix operation.
 * @returns Promise that resolves with a CheckoutResult containing information about the
 * newly created project and the changes made during the remix operation.
 */
export async function remix(
  params: RemixParams,
): Promise<RemixResult> {
  const itemStateChanges = new ItemStatusManager();

  const {
    targetDir,
    srcProjectId,
    projectName,
    gitignoreRules,
  } = params;

  const srcBranch = await branchNameToBranch(
    srcProjectId,
    params.srcBranchId ?? DEFAULT_BRANCH_NAME,
  );
  const srcProject = await sdk.projects.retrieve(srcProjectId);

  const description = (params.description ?? srcProject.description) || "";
  const privacy = (params.privacy ?? srcProject.privacy) ||
    DEFAULT_PROJECT_PRIVACY;

  return await doAtomically(async () => {
    // First, clone the source project to the target directory
    const { itemStateChanges: cloneResult } = await clone({
      targetDir,
      projectId: srcProject.id,
      branchId: srcBranch.id,
      version: srcBranch.version,
      gitignoreRules,
    });
    itemStateChanges.merge(cloneResult);

    // Create a new project using the files in the target directory
    const { itemStateChanges: createResult, newProjectId, newBranchId } =
      await create({
        sourceDir: targetDir,
        projectName,
        description,
        privacy,
        gitignoreRules,
      });
    itemStateChanges.merge(createResult);

    // Update the type of each of each file in the project to match the type in
    // the original project
    await Promise.all(
      (await listProjectItems(
        srcProjectId,
        srcBranch.id,
        await getLatestVersion(srcProjectId, srcBranch.id),
      )).map(async (item) => {
        if (item.type === "directory") return;
        await sdk.projects.files.update(newProjectId, {
          path: item.path,
          type: item.type,
          branch_id: newBranchId,
        });
      }),
    );

    return [{
      toProjectId: newProjectId,
      toVersion: await getLatestVersion(
        newProjectId,
        newBranchId,
      ),
      fileStateChanges: createResult,
    }, true];
  }, { targetDir });
}
