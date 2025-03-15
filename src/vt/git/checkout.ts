import { cleanDirectory, doAtomically } from "~/vt/git/utils.ts";
import { clone } from "~/vt/git/clone.ts";
import sdk from "~/sdk.ts";
import { copy } from "@std/fs";
import ValTown from "@valtown/sdk";

export interface CheckoutResult {
  fromBranch: ValTown.Projects.BranchCreateResponse;
  toBranch: ValTown.Projects.BranchCreateResponse;
  createdNew: boolean;
}

type BaseCheckoutParams = {
  targetDir: string;
  projectId: string;
  ignoreGlobs: string[];
};

type BranchCheckoutParams = BaseCheckoutParams & {
  branchId: string;
  version: number;
  fromBranchId?: string; // Optional source branch ID to track where we're coming from
};

type ForkCheckoutParams = BaseCheckoutParams & {
  forkedFrom: string;
  name: string;
  version: number;
};

/**
 * Checks out a specific branch of a project. This is an atomic operation that
 * does nothing if it fails.
 *
 * @param {object} args
 * @param {string} args.targetDir - The directory where the branch will be checked out.
 * @param {string} args.projectId - The ID of the project.
 * @param {string} args.branchId - The ID of the branch to checkout.
 * @param {number} args.version - The version of the branch to checkout.
 * @param {string[]} args.ignoreGlobs - List of glob patterns for files to ignore during checkout.
 * @param {string} [args.fromBranchId] - The ID of the branch we're switching from.
 * @returns {Promise<CheckoutResult>} A promise that resolves with checkout information.
 */
export function checkout(
  args: BranchCheckoutParams,
): Promise<CheckoutResult>;

/**
  * Creates a fork of a project's branch and checks it out. This is an atomic
  * operation that does nothing if it fails.
  *
  * @param {object} args
  * @param {string} args.targetDir - The directory where the fork will be checked out.
  * @param {string} args.projectId - The ID of the project to fork.
  * @param {string} args.forkedFrom - The branch ID from which to create the fork.
  * @param {string} args.name - The name for the new forked branch.
  * @param {number} args.version - The version of the fork to checkout.
  * @param {string[]} args.ignoreGlobs - List of glob patterns for files to ignore during checkout.
  * @returns {Promise<CheckoutResult>} A promise that resolves with checkout information including the new branch
 details.
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
        if (args.fromBranchId) {
          fromBranch = await sdk.projects.branches.retrieve(
            args.projectId,
            args.fromBranchId,
          );
        } else {
          fromBranch = toBranch; // Default if no source branch specified
        }
      } else {
        // Creating a new fork
        createdNew = true;

        // Get the source branch info
        fromBranch = await sdk.projects.branches.retrieve(
          args.projectId,
          args.forkedFrom,
        );

        // Create the new branch
        toBranch = await sdk.projects.branches.create(
          args.projectId,
          { branchId: args.forkedFrom, name: args.name },
        );

        checkoutBranchId = toBranch.id;
        checkoutVersion = toBranch.version;
      }

      // Clone the branch into the temporary directory
      await clone({
        targetDir: tmpDir,
        projectId: args.projectId,
        branchId: checkoutBranchId,
        ignoreGlobs: args.ignoreGlobs,
        version: checkoutVersion,
      });

      // Purge their version before copying back over
      await cleanDirectory(args.targetDir, args.ignoreGlobs);

      // We cloned with ignoreGlobs so we're safe to copy everything
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
