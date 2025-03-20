import { doAtomically } from "~/vt/lib/utils.ts";
import sdk from "~/sdk.ts";
import { copy } from "@std/fs";
import type ValTown from "@valtown/sdk";
import { pull } from "~/vt/lib/pull.ts";

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

      // Clone the branch into the temporary directory
      await pull({
        targetDir: tmpDir,
        projectId: args.projectId,
        branchId: checkoutBranchId,
        gitignoreRules: args.gitignoreRules,
        version: checkoutVersion,
      });

      // We cloned with gitignore rules so we're safe to copy everything
      await copy(tmpDir, args.targetDir, {
        overwrite: true,
        preserveTimestamps: true,
      });

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
