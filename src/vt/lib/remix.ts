import { clone } from "~/vt/lib/clone.ts";
import { create } from "~/vt/lib/create.ts";
import sdk, {
  branchNameToBranch,
  getLatestVersion,
  listValItems,
} from "~/sdk.ts";
import { doAtomically } from "~/vt/lib/utils/misc.ts";
import { DEFAULT_BRANCH_NAME, DEFAULT_VAL_PRIVACY } from "~/consts.ts";
import { ItemStatusManager } from "~/vt/lib/utils/ItemStatusManager.ts";
import type { ValPrivacy } from "~/types.ts";

/**
 * Result of remixing a val.
 *
 * When a val is remixed, a new val is created based on an existing val.
 * This object contains information about the newly created val and the changes
 * that were made to the local file state during the remix operation.
 */
export interface RemixResult {
  /** The ID of the newly created val */
  toValId: string;
  /** The version number of the newly created val */
  toVersion: number;
  /**
   * Changes made to local state during the remix process. This is roughly the
   * same result as cloning the val being remixed.
   */
  fileStateChanges: ItemStatusManager;
}

/**
 * Parameters for remixing some Val Town val to a new Val Town val.
 */
export interface RemixParams {
  /** The root directory to contain the newly remixed val. */
  targetDir: string;
  /** The id of the val to remix from. */
  srcValId: string;
  /** The id of the branch to remix. Defaults to the main branch. */
  srcBranchId: string;
  /** The name for the new val. */
  valName: string;
  /** Optional val description. */
  description?: string;
  /** Privacy setting for the val. Defaults to "private". */
  privacy?: ValPrivacy;
  /** A list of gitignore rules. */
  gitignoreRules?: string[];
}

/**
 * Remixes an existing Val Town val to a new Val Town val.
 *
 * @param {RemixParams} params Options for remix operation.
 *
 * @returns Promise that resolves with a CheckoutResult containing information about the
 * newly created val and the changes made during the remix operation.
 */
export async function remix(
  params: RemixParams,
): Promise<RemixResult> {
  const itemStateChanges = new ItemStatusManager();

  const {
    targetDir,
    srcValId,
    valName,
    gitignoreRules,
  } = params;

  const srcBranch = await branchNameToBranch(
    srcValId,
    params.srcBranchId ?? DEFAULT_BRANCH_NAME,
  );
  const srcVal = await sdk.vals.retrieve(srcValId);

  const description = (params.description ?? srcVal.description) || "";
  const privacy = (params.privacy ?? srcVal.privacy) ||
    DEFAULT_VAL_PRIVACY;

  return await doAtomically(async () => {
    // First, clone the source val to the target directory
    const { itemStateChanges: cloneResult } = await clone({
      targetDir,
      valId: srcVal.id,
      branchId: srcBranch.id,
      version: srcBranch.version,
      gitignoreRules,
    });
    itemStateChanges.merge(cloneResult);

    // Create a new val using the files in the target directory
    const { itemStateChanges: createResult, newValId, newBranchId } =
      await create({
        sourceDir: targetDir,
        valName,
        description,
        privacy,
        gitignoreRules,
      });
    itemStateChanges.merge(createResult);

    // Update the type of each of each file in the val to match the type in
    // the original val
    await Promise.all(
      (await listValItems(
        srcValId,
        srcBranch.id,
        await getLatestVersion(srcValId, srcBranch.id),
      )).map(async (item) => {
        if (item.type === "directory") return;
        await sdk.vals.files.update(newValId, {
          path: item.path,
          type: item.type,
          branch_id: newBranchId,
        });
      }),
    );

    return [{
      toValId: newValId,
      toVersion: await getLatestVersion(
        newValId,
        newBranchId,
      ),
      fileStateChanges: createResult,
    }, true];
  }, { targetDir });
}
