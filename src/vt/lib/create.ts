import { push } from "~/vt/lib/push.ts";
import sdk, { branchNameToBranch } from "~/sdk.ts";
import type { ProjectPrivacy } from "~/types.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { ensureDir } from "@std/fs";
import type { ItemStatusManager } from "~/vt/lib/utils/ItemStatusManager.ts";

/**
 * Result of a checkout operation containing branch information and file
 * changes.
 */
interface CreateResponse {
  /** The state of the files that were pushed to the new project. */
  itemStateChanges: ItemStatusManager;
  /** The ID of the newly created project. */
  newProjectId: string;
  /** The ID of the new branch created in the new project. */
  newBranchId: string;
}

/**
 * Parameters for creating a new Val Town project from a local directory.
 */
export interface CreateParams {
  /** The root directory containing the files to upload to the new project. */
  sourceDir: string;
  /** The name for the new project. */
  projectName: string;
  /** Optional project description. Defaults to that of the project being remixed. */
  description?: string;
  /** Privacy setting for the project. Defaults to that of the project being remixed. */
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
): Promise<CreateResponse> {
  const {
    sourceDir,
    projectName,
    description = "",
    privacy = "private",
    gitignoreRules,
  } = params;

  await ensureDir(sourceDir);

  // Create a new project in Val Town
  const newProject = await sdk.projects.create({
    name: projectName,
    description,
    privacy,
  });
  const newBranch = await branchNameToBranch(
    newProject.id,
    DEFAULT_BRANCH_NAME,
  );

  // Push the local directory contents to the new project
  const { itemStateChanges } = await push({
    targetDir: sourceDir,
    projectId: newProject.id,
    branchId: newBranch.id,
    gitignoreRules,
  });

  return {
    itemStateChanges: itemStateChanges,
    newProjectId: newProject.id,
    newBranchId: newBranch.id,
  };
}
