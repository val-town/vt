import { doAtomically } from "~/vt/lib/utils.ts";
import sdk from "~/sdk.ts";
import type ValTown from "@valtown/sdk";
import { pull } from "~/vt/lib/pull.ts";
import { join, relative } from "@std/path";
import { copy, exists, walk } from "@std/fs";
import { getProjectItemType, shouldIgnore } from "~/vt/lib/paths.ts";
import { listProjectItems } from "~/sdk.ts";
import { FileState } from "~/vt/lib/FileState.ts";
import { FIRST_VERSION_NUMBER } from "~/consts.ts";

/**
 * Result of a checkout operation containing branch information and file
 * changes.
 */
export interface CheckoutResult {
  /** The source branch */
  fromBranch: ValTown.Projects.BranchCreateResponse;
  /**
   * The target branch or null if it was a dry run and you were forking to a
   * new branch, since a dry run won't create a new branch
   */
  toBranch: ValTown.Projects.BranchCreateResponse | null;
  /** Whether a new branch was created during checkout */
  createdNew: boolean;
  /** Changes made to files during the checkout process */
  fileStateChanges: FileState;
}

/**
 * Base parameters for all checkout operations.
 */
export type BaseCheckoutParams = {
  /** The directory where the branch will be checked out */
  targetDir: string;
  /** The ID of the project */
  projectId: string;
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
 * Checks out a specific existing branch of a project.
 * @param params Options for the checkout operation.
 * @returns {Promise<CheckoutResult>} A promise that resolves with checkout information.
 */
export function checkout(params: BranchCheckoutParams): Promise<CheckoutResult>;

/**
 * Creates a new branch from a project's branch and checks it out.
 * @param params Options for the checkout operation.
 * @returns {Promise<CheckoutResult>} A promise that resolves with checkout information (including the new branch details).
 */
export function checkout(params: ForkCheckoutParams): Promise<CheckoutResult>;
export function checkout(
  params: BranchCheckoutParams | ForkCheckoutParams,
): Promise<CheckoutResult> {
  return doAtomically(
    async (tmpDir) => {
      // Copy over the current state. That way we get accurate delta
      // information when we pull (internally, pull will call clone, and clone
      // will notice files that it is overwriting and mark them as overwritten
      // instead of created in such cases.)
      await copy(params.targetDir, tmpDir, {
        preserveTimestamps: true,
        overwrite: true,
      });

      const fileStateChanges = FileState.empty();

      // Determine if we're creating a new branch or checking out an existing one
      const createdNew = !("toBranchId" in params);

      let toBranch: ValTown.Projects.BranchCreateResponse | null = null;
      let fromBranch: ValTown.Projects.BranchCreateResponse;

      if (createdNew) {
        // Creating a new fork
        // Get the source branch info
        fromBranch = await sdk.projects.branches.retrieve(
          params.projectId,
          (params as ForkCheckoutParams).forkedFromId,
        );
        // In this case to branch is just the from branch effectively, since
        // they will have the same state
        toBranch = fromBranch;
        // Except that it is at its now first version
        toBranch.version = FIRST_VERSION_NUMBER;

        // Create the new branch
        if (!params.dryRun) {
          toBranch = await sdk.projects.branches.create(
            params.projectId,
            {
              branchId: (params as ForkCheckoutParams).forkedFromId,
              name: (params as ForkCheckoutParams).name,
            },
          );
        }
      } else {
        // Get the target branch info
        toBranch = await sdk.projects.branches.retrieve(
          params.projectId,
          (params as BranchCheckoutParams).toBranchId,
        );
        toBranch.version = params.toBranchVersion || toBranch.version;

        // Get the source branch info if provided, otherwise use the target branch
        fromBranch = await sdk.projects.branches.retrieve(
          params.projectId,
          (params as BranchCheckoutParams).fromBranchId,
        );
      }

      // Get files from the source branch
      const fromFiles = new Set(
        await listProjectItems(params.projectId, {
          path: "",
          branch_id: fromBranch.id,
          version: fromBranch.version,
          recursive: true,
        }).then((resp) => resp.map((file) => file.path)),
      );

      // Get files from the target branch. Note that the target branch is
      // effectively the same as the source branch if checkout branch
      // id/checkout version id are undefined, since in that case we are
      // forking, and when we are forking we are copying the from branch.
      const toFiles = new Set(
        await listProjectItems(params.projectId, {
          path: "",
          branch_id: toBranch.id,
          version: toBranch.version,
          recursive: true,
        }).then((resp) => resp.map((file) => file.path)),
      );

      // Clone the target branch into the temporary directory
      const pullResult = await pull({
        targetDir: tmpDir,
        projectId: params.projectId,
        branchId: toBranch.id,
        version: toBranch.version,
        gitignoreRules: params.gitignoreRules,
        dryRun: params.dryRun,
      });
      fileStateChanges.merge(pullResult);

      // Scan the target directory to identify files that need to be deleted
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
            type: stat.isDirectory
              ? "directory"
              : await getProjectItemType(params.projectId, {
                branchId: fromBranch.id,
                version: fromBranch.version,
                filePath: relativePath,
              }),
          });

          // Delete the file from both directories if not in dry run mode
          if (!params.dryRun) {
            if (await exists(targetDirPath)) {
              await Deno.remove(targetDirPath, { recursive: true });
            }
            if (await exists(tmpDirPath)) {
              await Deno.remove(tmpDirPath, { recursive: true });
            }
          }
        }
      }

      // Return checkout result with branch information and whether changes should be applied
      return [{
        fromBranch,
        toBranch,
        createdNew,
        fileStateChanges,
      }, !params.dryRun];
    },
    params.targetDir,
    "vt_checkout_",
  );
}
