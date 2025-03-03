import { withTempDir } from "~/vt/git/utils.ts";
import { clone } from "~/vt/git/clone.ts";
import sdk from "~/sdk.ts";
import { copy } from "@std/fs";

/**
 * Checks out a specific branch of a project by creating a temporary directory,
 * cloning the branch into it, and then copying the contents to the target
 * directory.
 *
 * This is an atomic operation, and if the underlying clone fails nothing
 * changes.
 *
 * @param {object} args
 * @param {string} args.targetDir The directory where the branch contents will be checked out
 * @param {string} args.projectId The uuid of the project
 * @param {string} args.toBranchId The ID of the branch to checkout
 * @param {string[]} args.ignoreGlobs List of glob patterns for files to ignore during checkout
 */
export async function checkout({
  targetDir,
  projectId,
  toBranchId,
  ignoreGlobs,
}: {
  targetDir: string;
  projectId: string;
  toBranchId: string;
  ignoreGlobs: string[];
}) {
  // Create a secure temporary directory using Deno.makeTempDir
  const { tempDir, cleanup } = await withTempDir("vt_checkout_");

  try {
    // Get the latest version number of the target branch
    const branchInfo = await sdk.projects.branches.retrieve(
      projectId,
      toBranchId,
    );

    // Clone the new branch into the temporary directory
    await clone({
      targetDir: tempDir,
      projectId,
      branchId: toBranchId,
      version: branchInfo.version,
      ignoreGlobs,
    });

    // We cloned with ignoreGlobs so we're safe to copy everything
    await copy(tempDir, targetDir, { overwrite: true });
  } finally {
    await cleanup();
  }
}
