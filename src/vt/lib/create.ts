import { push } from "~/vt/lib/push.ts";
import sdk, { branchNameToBranch } from "~/sdk.ts";
import type { ItemStatusManager } from "~/vt/lib/ItemStatusManager.ts";
import type { ValPrivacy } from "~/types.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { ensureDir } from "@std/fs";

/**
 * Result of a checkout operation containing branch information and file
 * changes.
 */
interface CreateResponse {
  /** The state of the files that were pushed to the new val. */
  itemStateChanges: ItemStatusManager;
  /** The ID of the newly created val. */
  newValId: string;
  /** The ID of the new branch created in the new val. */
  newBranchId: string;
}

/**
 * Parameters for creating a new Val Town val from a local directory.
 */
export interface CreateParams {
  /** The root directory containing the files to upload to the new val. */
  sourceDir: string;
  /** The name for the new val. */
  valName: string;
  /** Optional val description. Defaults to that of the val being remixed. */
  description?: string;
  /** Privacy setting for the val. Defaults to that of the val being remixed. */
  privacy?: ValPrivacy;
  /** A list of gitignore rules. */
  gitignoreRules?: string[];
}

/**
 * Creates a new Val Town val from a local directory.
 *
 * @param {CreateParams} params Options for create operation.
 *
 * @returns Promise that resolves with changes that were applied during the push operation and the new val ID.
 */
export async function create(
  params: CreateParams,
): Promise<CreateResponse> {
  const {
    sourceDir,
    valName,
    description = "",
    privacy = "private",
    gitignoreRules,
  } = params;

  await ensureDir(sourceDir);

  // Create a new val in Val Town
  const newval = await sdk.vals.create({
    name: valName,
    description,
    privacy,
  });
  const newBranch = await branchNameToBranch(
    newval.id,
    DEFAULT_BRANCH_NAME,
  );

  // Push the local directory contents to the new val
  const { itemStateChanges } = await push({
    targetDir: sourceDir,
    valId: newval.id,
    branchId: newBranch.id,
    gitignoreRules,
  });

  return {
    itemStateChanges: itemStateChanges,
    newValId: newval.id,
    newBranchId: newBranch.id,
  };
}
