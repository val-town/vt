import { clone } from "~/vt/git/clone.ts";
import { status } from "~/vt/git/status.ts";
import * as path from "@std/path";

/**
 * Pulls latest changes from a val town project into a vt folder.
 *
 * @param args Options for pull operation.
 * @param {string} args.targetDir The vt project root directory.
 * @param {string} args.projectId The id of the project to be pulled.
 * @param {string} args.branchId The branch ID from which to pull the latest changes.
 * @param {string[]} args.ignoreGlobs A list of glob patterns for files to exclude.
 *
 * @returns Promise that resolves when the pull operation is complete.
 */
export async function pull({
  targetDir,
  projectId,
  branchId,
  version,
  ignoreGlobs,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  version: number;
  ignoreGlobs: string[];
}): Promise<void> {
  const statusResult = await status({
    targetDir,
    projectId,
    branchId,
    ignoreGlobs,
  });

  // Remove all existing tracked files
  const removalPromises = statusResult.not_modified
    .map((file) => path.join(targetDir, file.path))
    .map(async (filePath) => {
      try {
        await Deno.remove(filePath);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    });
  await Promise.all(removalPromises);

  // Clone fresh files from the project
  await clone({
    targetDir,
    projectId,
    branchId,
    version,
    ignoreGlobs,
  });
}
