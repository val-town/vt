import sdk from "~/sdk.ts";
import { clone } from "~/vt/git/clone.ts";
import { status } from "~/vt/git/status.ts";
import * as path from "@std/path";
import { isDirty } from "~/vt/git/utils.ts";

/**
 * Pulls latest changes from a val town project into a vt folder.
 * Checks to make sure that a dirty directory (changes locally that would be
 * overwritten) does not get pulled to.
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

  if (isDirty(statusResult)) {
    throw new Error(
      "Working directory dirty. Please back up or discard local changes before pulling.",
    );
  }

  // Remove all existing tracked files
  const filesToRemove = [...statusResult.not_modified].map((file) =>
    path.join(targetDir, file.path)
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
