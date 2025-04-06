import { doAtomically } from "~/vt/lib/utils.ts";
import { clone } from "~/vt/lib/clone.ts";
import { push } from "~/vt/lib/push.ts";
import sdk from "~/sdk.ts";
import type { FileState } from "~/vt/lib/FileState.ts";

/**
 * Privacy settings for a Val Town project.
 */
export type ProjectPrivacy = "public" | "unlisted" | "private";

/**
 * Parameters for remixing some Val Town project to a new Val Town project.
 */
export interface RemixParams {
  /** The root directory to contain the newly remixed project. */
  targetDir: string;
  /** The id of the project to remix from. */
  srcProjectId: string;
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
 * @param {RemixParams} params Options for remix operation.
 *
 * @returns Promise that resolves with changes that were applied during the push operation to sync the new project with the one we are remixing from.
 */
export async function remix(params: RemixParams): Promise<[FileState, string]> {
  const {
    targetDir,
    srcProjectId,
    projectName,
    description = "",
    privacy = "private",
    gitignoreRules,
  } = params;

  return await doAtomically(async () => {
    // Get the source project
    const srcProject = await sdk.projects.retrieve(srcProjectId);

    if (!srcProject) {
      throw new Error("Source project not found");
    }

    const srcBranchId = srcProject.id;

    // First, clone the source project to the target directory
    const cloneResult = await clone({
      targetDir,
      projectId: srcProjectId,
      branchId: srcBranchId,
      gitignoreRules,
    });

    // Create a new project in Val Town
    const newProject = await sdk.projects.create({
      name: projectName,
      description,
      privacy,
    });

    const dstProjectId = newProject.id;
    const dstBranchId = newProject.id; // Assuming default branch ID is the same as project ID

    // Then, push the cloned files to the new project
    const pushResult = await push({
      targetDir,
      projectId: dstProjectId,
      branchId: dstBranchId,
      gitignoreRules,
      fileState: cloneResult, // Use the file state from the clone operation
    });

    return [[pushResult, dstProjectId], true];
  }, { targetDir });
}
