import { doAtomically } from "~/vt/lib/utils.ts";
import sdk from "~/sdk.ts";
import type ValTown from "@valtown/sdk";
import { pull } from "~/vt/lib/pull.ts";
import { relative } from "@std/path";
import { walk } from "@std/fs";
import { shouldIgnore } from "~/vt/lib/paths.ts";
import { listProjectItems } from "~/sdk.ts";

export interface CheckoutResult {
  fromBranch: ValTown.Projects.BranchCreateResponse;
  toBranch: ValTown.Projects.BranchCreateResponse;
  createdNew: boolean;
}

type BaseCheckoutParams = {
  targetDir: string;
  projectId: string;
  gitignoreRules: string[];
};

type BranchCheckoutParams = BaseCheckoutParams & {
  branchId: string;
  version: number;
  fromBranchId: string;
};

type ForkCheckoutParams = BaseCheckoutParams & {
  forkedFromId: string;
  name: string;
  version: number;
};

/**
 * Checks out a specific existing branch of a project.
 *
 * @param {object} args
 * @param {string} args.targetDir - The directory where the branch will be checked out.
 * @param {string} args.projectId - The ID of the project.
 * @param {string} args.branchId - The ID of the branch to checkout.
 * @param {number} args.version - The version of the branch to checkout.
 * @param {string[]} args.gitignoreRules - List of gitignore rules.
 * @param {string} [args.fromBranchId] - The ID of the branch we're switching from.
 * @returns {Promise<CheckoutResult>} A promise that resolves with checkout information.
 */
export function checkout(args: BranchCheckoutParams): Promise<CheckoutResult>;

/**
 * Creates a new branch from a project's branch and checks it out.
 *
 * @param {object} args
 * @param {string} args.targetDir - The directory where the fork will be checked out.
 * @param {string} args.projectId - The ID of the project to fork.
 * @param {string} args.forkedFrom - The branch ID from which to create the fork.
 * @param {string} args.name - The name for the new forked branch.
 * @param {number} args.version - The version of the fork to checkout.
 * @param {string[]} args.gitignoreRules - List of gitignore rules.
 * @returns {Promise<CheckoutResult>} A promise that resolves with checkout information (including the new branch details).
 */
export function checkout(
  args: ForkCheckoutParams,
): Promise<CheckoutResult>;
export function checkout(
  args: BranchCheckoutParams | ForkCheckoutParams,
): Promise<CheckoutResult> {
  return doAtomically(
    async (tmpDir) => {
      let checkoutBranchId: string;
      let checkoutVersion: number;
      let toBranch: ValTown.Projects.BranchCreateResponse;
      let fromBranch: ValTown.Projects.BranchCreateResponse;
      let createdNew = false;

      if ("branchId" in args) {
        // Checking out existing branch
        checkoutBranchId = args.branchId;
        checkoutVersion = args.version;

        // Get the target branch info
        toBranch = await sdk.projects.branches.retrieve(
          args.projectId,
          checkoutBranchId,
        );

        // Get the source branch info if provided, otherwise use the target branch
        fromBranch = await sdk.projects.branches.retrieve(
          args.projectId,
          args.fromBranchId,
        );
      } else {
        // Creating a new fork
        createdNew = true;

        // Get the source branch info
        fromBranch = await sdk.projects.branches.retrieve(
          args.projectId,
          args.forkedFromId,
        );

        // Create the new branch
        toBranch = await sdk.projects.branches.create(
          args.projectId,
          { branchId: args.forkedFromId, name: args.name },
        );

        checkoutBranchId = toBranch.id;
        checkoutVersion = toBranch.version;
      }

      // Get files from the source branch
      const fromFiles = new Set(
        await listProjectItems(args.projectId, {
          path: "",
          branch_id: fromBranch.id,
          version: fromBranch.version,
          recursive: true,
        }).then((resp) => resp.map((file) => file.path)),
      );

      // Get files from the target branch
      const toFiles = new Set(
        await listProjectItems(args.projectId, {
          path: "",
          branch_id: checkoutBranchId,
          version: checkoutVersion,
          recursive: true,
        }).then((resp) => resp.map((file) => file.path)),
      );

      // Clone the target branch into the temporary directory
      await pull({
        targetDir: tmpDir,
        projectId: args.projectId,
        branchId: checkoutBranchId,
        version: checkoutVersion,
        gitignoreRules: args.gitignoreRules,
      });

      // Walk through the target directory to find files
      for await (const entry of walk(args.targetDir)) {
        if (entry.isDirectory) continue;

        const relativePath = relative(args.targetDir, entry.path);

        // Skip files that match gitignore rules
        if (shouldIgnore(relativePath, args.gitignoreRules)) continue;

        // Skip root directory
        if (relativePath === "" || entry.path === args.targetDir) continue;

        // If the file was in the source branch but not in the target branch, delete it
        // This preserves untracked files (files not in fromFiles)
        if (fromFiles.has(relativePath) && !toFiles.has(relativePath)) {
          await Deno.remove(entry.path, { recursive: true });
        }
      }

      // Return checkout result with branch information
      return {
        fromBranch,
        toBranch,
        createdNew,
      };
    },
    args.targetDir,
    "vt_checkout_",
  );
}
