import sdk, { listValItems } from "~/sdk.ts";
import type ValTown from "@valtown/sdk";
import { pull } from "~/vt/lib/pull.ts";
import { getvalItemType, shouldIgnore } from "~/vt/lib/paths.ts";
import { join, relative } from "@std/path";
import { ItemStatusManager } from "~/vt/lib/utils/ItemStatusManager.ts";
import { doAtomically, gracefulRecursiveCopy } from "~/vt/lib/utils/misc.ts";
import { walk } from "@std/fs";

/**
 * Result of a checkout operation containing branch information and file
 * changes.
 */
export interface CheckoutResult {
  /** The source branch */
  fromBranch: ValTown.Vals.BranchCreateResponse;
  /**
   * The target branch or null if it was a dry run and you were forking to a
   * new branch, since a dry run won't create a new branch
   */
  toBranch: ValTown.Vals.BranchCreateResponse | null;
  /** Whether a new branch was created during checkout */
  createdNew: boolean;
  /** Changes made to files during the checkout process */
  fileStateChanges: ItemStatusManager;
}

/**
 * Base parameters for all checkout operations.
 */
export type BaseCheckoutParams = {
  /** The directory where the branch will be checked out */
  targetDir: string;
  /** The ID of the val */
  valId: string;
  /** If true, simulates the checkout without making changes */
  dryRun?: boolean;
  /** A list of gitignore rules. */
  gitignoreRules?: string[];
  /** Specific version to checkout. Defaults to latest */
  toBranchVersion?: number;
};

/**
 * Parameters for checking out an existing branch.
 */
export type BranchCheckoutParams = BaseCheckoutParams & {
  /** The ID of the branch to checkout */
  toBranchId: string;
  /** The ID of the branch we're switching from */
  fromBranchId: string;
};

/**
 * Parameters for creating and checking out a new branch (fork).
 */
export type ForkCheckoutParams = BaseCheckoutParams & {
  /** The branch ID from which to create the fork */
  forkedFromId: string;
  /** The name for the new forked branch */
  name: string;
};

/**
 * Checks out a specific existing branch of a val.
 * @param params Options for the checkout operation.
 * @returns {Promise<CheckoutResult>} A promise that resolves with checkout information.
 */
export function checkout(params: BranchCheckoutParams): Promise<CheckoutResult>;

/**
  * Creates a new branch from a val's branch and checks it out.
  * @param params Options for the checkout operation.
  * @returns {Promise<CheckoutResult>} A promise that resolves with checkout information (including the new branch
 details).
  */
export function checkout(params: ForkCheckoutParams): Promise<CheckoutResult>;
export function checkout(
  params: BranchCheckoutParams | ForkCheckoutParams,
): Promise<CheckoutResult> {
  // Determine if we're creating a new branch or checking out an existing one
  const createdNew = !("toBranchId" in params);

  if (createdNew) {
    // For forking/creating new branch, we don't need a temp directory
    return handleForkCheckout(params as ForkCheckoutParams);
  } else {
    // For regular branch checkout, use the existing temp dir approach
    return handleBranchCheckout(params as BranchCheckoutParams);
  }
}

/**
 * Handles creating a new branch (fork) and marking all files as not_modified
 */
async function handleForkCheckout(
  params: ForkCheckoutParams,
): Promise<CheckoutResult> {
  const fileStateChanges = new ItemStatusManager();

  // Get the source branch info
  const fromBranch:
    | Awaited<ReturnType<typeof sdk.vals.branches.retrieve>>
    | null = await sdk.vals.branches.retrieve(
      params.valId,
      params.forkedFromId,
    );

  // Create the new branch if not a dry run
  const toBranch = (!params.dryRun)
    ? await sdk.vals.branches.create(
      params.valId,
      {
        branchId: params.forkedFromId,
        name: params.name,
      },
    )
    : null;

  // Ensure everything is marked as not changed
  await listValItems(
    params.valId,
    fromBranch.id,
    fromBranch.version,
  ).then((items) =>
    Promise.all(
      items.map((item) => {
        // Ignore files that are in the gitignore rules
        if (shouldIgnore(item.path, params.gitignoreRules)) return;

        return fileStateChanges.insert({
          path: item.path,
          status: "not_modified",
          type: item.type,
          mtime: new Date(item.updatedAt).getTime(),
        });
      }),
    )
  );

  return {
    fromBranch,
    toBranch,
    createdNew: true,
    fileStateChanges,
  };
}

/**
 * Handles checking out an existing branch
 */
async function handleBranchCheckout(
  params: BranchCheckoutParams,
): Promise<CheckoutResult> {
  return await doAtomically(
    async (tmpDir) => {
      await gracefulRecursiveCopy(params.targetDir, tmpDir, {
        overwrite: true,
        preserveTimestamps: true,
      });

      const fileStateChanges = new ItemStatusManager();

      // Get the target branch info
      let toBranch:
        | Awaited<ReturnType<typeof sdk.vals.branches.retrieve>>
        | null = await sdk.vals.branches.retrieve(
          params.valId,
          params.toBranchId,
        );
      toBranch.version = params.toBranchVersion || toBranch.version;

      // Get the source branch info
      const fromBranch = await sdk.vals.branches.retrieve(
        params.valId,
        params.fromBranchId,
      );

      const fromFiles = new Set(
        await listValItems(
          params.valId,
          fromBranch.id,
          fromBranch.version,
        ).then((resp) => resp.map((item) => item.path)),
      );

      // Get files from the target branch
      const toFiles = new Set(
        await listValItems(
          params.valId,
          toBranch.id,
          toBranch.version,
        ).then((resp) => resp.map((item) => item.path)),
      );

      // Clone the target branch into the temporary directory
      const pullResult = await pull({
        targetDir: tmpDir,
        valId: params.valId,
        branchId: toBranch.id,
        version: toBranch.version,
        gitignoreRules: params.gitignoreRules,
        dryRun: params.dryRun,
      });
      fileStateChanges.merge(pullResult);

      // Scan the target directory to identify files that need to be deleted
      const pathsToDelete: string[] = [];
      for await (const entry of walk(params.targetDir)) {
        const relativePath = relative(params.targetDir, entry.path);
        const targetDirPath = entry.path;
        const tmpDirPath = join(tmpDir, relativePath);

        if (shouldIgnore(relativePath, params.gitignoreRules)) continue;
        if (relativePath === "" || entry.path === params.targetDir) continue;

        // If the file was in the source branch but not in the target branch,
        // delete it. This preserves untracked files (files not in fromFiles)
        if (fromFiles.has(relativePath) && !toFiles.has(relativePath)) {
          const stat = await Deno.stat(entry.path);

          fileStateChanges.insert({
            path: relativePath,
            status: "deleted",
            type: stat.isDirectory ? "directory" : await getvalItemType(
              params.valId,
              fromBranch.id,
              fromBranch.version,
              relativePath,
            ),
            mtime: stat.mtime!.getTime(),
          });

          // Delete the file from both directories if not in dry run mode
          // That way it isn't also copied back
          if (!params.dryRun) {
            pathsToDelete.push(targetDirPath);
            pathsToDelete.push(tmpDirPath);
          }
        }
      }

      // Perform the deletions
      await Promise.all(pathsToDelete.map(async (path) => {
        try {
          await Deno.remove(path, { recursive: true });
        } catch (e) {
          if (!(e instanceof Deno.errors.NotFound)) throw e;
        }
      }));

      // If it is a dry run then the toBranch was only for use temporarily
      if (params.dryRun) toBranch = null;

      return [{
        fromBranch,
        toBranch,
        createdNew: false,
        fileStateChanges,
      }, !params.dryRun];
    },
    { targetDir: params.targetDir },
  );
}
