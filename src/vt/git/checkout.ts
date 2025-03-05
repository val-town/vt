import { cleanDirectory, withTempDir } from "~/vt/git/utils.ts";
import { clone } from "~/vt/git/clone.ts";
import sdk from "~/sdk.ts";
import { copy } from "@std/fs";

type BaseCheckoutParams = {
  targetDir: string;
  projectId: string;
  ignoreGlobs: string[];
};

/**
 * Checks out a specific branch of a project by creating a temporary directory,
 * cloning the branch into it, and then copying the contents to the target
 * directory.
 *
 * This is an atomic operation, and if the underlying clone fails nothing
 * changes.
 */
export function checkout(
  args: BaseCheckoutParams & { branchId: string },
): Promise<void>;
export function checkout(
  args: BaseCheckoutParams & { forkedFrom: string; name: string },
): Promise<void>;
export async function checkout(
  args:
    & BaseCheckoutParams
    & ({ branchId: string } | { forkedFrom: string; name: string }),
) {
  const { tempDir, cleanup } = await withTempDir("vt_checkout_");

  try {
    let checkoutBranchId: string;
    let branchVersion: number;

    if ("branchId" in args) {
      const branchInfo = await sdk.projects.branches.retrieve(
        args.projectId,
        args.branchId,
      );
      checkoutBranchId = args.branchId;
      branchVersion = branchInfo.version;
    } else {
      const newBranch = await sdk.projects.branches.create(
        args.projectId,
        { branchId: args.forkedFrom, name: args.name },
      );
      checkoutBranchId = newBranch.id;
      branchVersion = newBranch.version;
    }

    // Clone the branch into the temporary directory
    await clone({
      targetDir: tempDir,
      projectId: args.projectId,
      branchId: checkoutBranchId,
      version: branchVersion,
      ignoreGlobs: args.ignoreGlobs,
    });

    // Purge their version before copying back over
    await cleanDirectory(args.targetDir, args.ignoreGlobs);

    // We cloned with ignoreGlobs so we're safe to copy everything
    await copy(tempDir, args.targetDir, {
      overwrite: true,
      preserveTimestamps: true,
    });
  } finally {
    await cleanup();
  }
}
