import sdk from "~/sdk.ts";
import { clone } from "~/vt/git/clone.ts";
import { join } from "jsr:@std/path";
import { status } from "~/vt/git/status.ts";

/**
 * Pulls the latest changes from a val town project.
 *
 * @param args The arguments for the pull operation.
 * @param args.targetDir The directory where the project files will be updated.
 * @param args.projectId The directory path of the local project that needs to be updated.
 * @param args.branchId The branch ID from which to pull the latest changes.
 * @param args.ignoreGlobs A list of glob patterns for files to exclude.
 *
 * @returns A promise that resolves when the pull operation is complete.
 */
export async function pull({
  targetDir,
  projectId,
  branchId,
  ignoreGlobs,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  ignoreGlobs: string[];
}): Promise<void> {
  const statusResult = await status({
    targetDir,
    projectId,
    branchId,
    ignoreGlobs,
  });

  // Check if directory is dirty (has any changes) using `status`'s result
  const isDirty = statusResult.modified.length > 0 ||
    statusResult.created.length > 0 ||
    statusResult.deleted.length > 0;

  if (isDirty) {
    throw new Error(
      "Working directory dirty. Please back up or discard local changes before pulling.",
    );
  }

  // Remove all existing tracked files
  const filesToRemove = [...statusResult.not_modified].map((file) =>
    join(targetDir, file.path)
  );

  // Delete all the "tracked" files so we can pull. TODO: only delete files
  // that haven't changed.
  for (const filePath of filesToRemove) {
    try {
      await Deno.remove(filePath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  }

  // TODO: handle renames

  // Get the latest version number
  const latestVersion = (await sdk.projects.branches.retrieve(
    projectId,
    branchId,
  )).version;

  // Clone fresh files from the project
  await clone({
    targetDir,
    projectId,
    branchId,
    version: latestVersion,
    ignoreGlobs,
  });
}
