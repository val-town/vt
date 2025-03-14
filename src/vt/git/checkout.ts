import { cleanDirectory, doAtomically } from "~/vt/git/utils.ts";
import { clone } from "~/vt/git/clone.ts";
import sdk from "~/sdk.ts";
import { copy } from "@std/fs";
import ValTown from "@valtown/sdk";

type BaseCheckoutParams = {
  targetDir: string;
  projectId: string;
  ignoreGlobs: string[];
};

type BranchCheckoutParams = BaseCheckoutParams & {
  branchId: string;
  version: number;
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
 * @returns {Promise<{ id: string, version: number }>} A promise that resolves with branch information when the branch checkout is complete.
 */
export function checkout(args: BranchCheckoutParams): Promise<{ id: string, version: number }>;

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
 * @returns {Promise<void>} A promise that resolves when the fork checkout is complete.
 */
export function checkout(
  args: ForkCheckoutParams,
): Promise<ValTown.Projects.BranchCreateResponse>;
export function checkout(
  args: BranchCheckoutParams | ForkCheckoutParams,
) {
  return doAtomically(
    async (tmpDir) => {
      let checkoutBranchId: string;
      let checkoutVersion: number;
      let newBranch: ValTown.Projects.BranchCreateResponse | undefined =
        undefined;

      if ("branchId" in args) {
        checkoutBranchId = args.branchId;
        checkoutVersion = args.version;
      } else {
        newBranch = await sdk.projects.branches.create(
          args.projectId,
          { branchId: args.forkedFrom, name: args.name },
        );
        checkoutBranchId = newBranch.id;
        checkoutVersion = newBranch.version;
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

      // Return an object with branch and version information for both forked and non-forked branches
      return "branchId" in args 
        ? { id: checkoutBranchId, version: checkoutVersion }
        : newBranch;
    },
    args.targetDir,
    "vt_checkout_",
  );
}
