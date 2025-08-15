import { push } from "~/vt/lib/push.ts";
import sdk, { branchNameToBranch } from "~/sdk.ts";
import type { ValPrivacy } from "~/types.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { ensureDir } from "@std/fs";
import { ItemStatusManager } from "~/vt/lib/utils/ItemStatusManager.ts";

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
 * Parameters for creating a new Val Town Val from a local directory.
 */
export interface CreateParams {
  /** The root directory containing the files to upload to the new val. */
  sourceDir: string;
  /** The name for the new val. */
  valName: string;
  /** Whether to upload after creating. */
  doUpload?: boolean;
  /** Optional Val description. Defaults to that of the Val being remixed. */
  description?: string;
  /** Privacy setting for the val. Defaults to that of the Val being remixed. */
  privacy?: ValPrivacy;
  /** A list of gitignore rules. */
  gitignoreRules?: string[];
}

/**
 * Creates a new Val Town Val from a local directory.
 *
 * @param params Options for create operation.
 * @returns Promise that resolves with changes that were applied during the push operation and the new Val ID.
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
    doUpload = true,
  } = params;

  await ensureDir(sourceDir);

  // Create a new Val in Val Town
  const newVal = await sdk.vals.create({
    name: valName,
    description,
    privacy,
  });
  const newBranch = await branchNameToBranch(
    newVal.id,
    DEFAULT_BRANCH_NAME,
  );

  // Push the local directory contents to the new val if requested
  let itemStateChanges = new ItemStatusManager();
  if (doUpload) {
    const { itemStateChanges: changes } = await push({
      targetDir: sourceDir,
      valId: newVal.id,
      branchId: newBranch.id,
      gitignoreRules,
    });
    itemStateChanges = changes;
  }

  return {
    itemStateChanges: itemStateChanges,
    newValId: newVal.id,
    newBranchId: newBranch.id,
  };
}
