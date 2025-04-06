import { push } from "~/vt/lib/push.ts";
import type { FileState } from "~/vt/lib/FileState.ts";
import sdk from "~/sdk.ts";

/**
 * Privacy settings for a Val Town project.
 */
export type ProjectPrivacy = "public" | "unlisted" | "private";

/**
 * Parameters for creating a new Val Town project from a local directory.
 */
export interface CreateParams {
  /** The root directory containing the files to upload to the new project. */
  sourceDir: string;
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
 * Creates a new Val Town project from a local directory.
 *
 * @param {CreateParams} params Options for create operation.
 *
 * @returns Promise that resolves with changes that were applied during the push operation and the new project ID.
 */
export async function create(
  params: CreateParams,
): Promise<{ fileState: FileState; projectId: string }> {
  const {
    sourceDir,
    projectName,
    description = "",
    privacy = "private",
    gitignoreRules,
  } = params;

  // Create a new project in Val Town
  const newProject = await sdk.projects.create({
    name: projectName,
    description,
    privacy,
  });

  const projectId = newProject.id;
  const branchId = await sdk.projects.branches.list(projectId, {
    limit: 1,
    offset: 0,
  }).then((resp) => resp.data[0].id);

  // Push the local directory contents to the new project
  const fileState = await push({
    targetDir: sourceDir,
    projectId,
    branchId,
    gitignoreRules,
  });

  return {
    fileState,
    projectId,
  };
}
