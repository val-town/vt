import sdk from "~/sdk.ts";
import { clone } from "~/vt/git/clone.ts";
import type ValTown from "@valtown/sdk";
import { join } from "jsr:@std/path";
import { globToRegExp } from "@std/path/glob-to-regexp";

/**
 * Pulls the latest changes from a val town project.
 *
 * @param args The arguments for the pull operation.
 * @param args.targetDir The directory where the project files will be updated.
 * @param args.projectId The directory path of the local project that needs to be updated.
 * @param args.branchId The branch ID from which to pull the latest changes.
 * @param args.ignoreGlobs A list of glob patterns for files to exclude from the pull operation.
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
  branchId?: string;
  ignoreGlobs: string[];
}): Promise<void> {
  // Convert ignore globs to RegExp patterns
  const ignorePatterns = ignoreGlobs.map((glob) => globToRegExp(glob));

  // Get a list of all the files that have changed on val town.
  const projectFilesResponse = await sdk.projects.files.list(projectId, {
    branch_id: branchId,
  });
  const projectFiles = projectFilesResponse.data;

  // Check to see if any files have been updated locally since the last pull/clone
  const isDirectoryDirty = await isDirty(
    targetDir,
    projectFiles,
    ignorePatterns,
  );

  if (isDirectoryDirty) {
    throw new Error("Working directory dirty. New changes not yet pushed.");
  }

  // Remove all files and directories that are tracked by vt and need to be refetched.
  const removingPromises: Promise<void>[] = [];
  for await (const dirEntry of Deno.readDir(targetDir)) {
    const fullPath = `${targetDir}/${dirEntry.name}`;
    if (
      !ignorePatterns.some((pattern) => pattern.test(fullPath)) &&
      !projectFiles.some((file) => file.path === dirEntry.name)
    ) {
      removingPromises.push(Deno.remove(fullPath, { recursive: true }));
    }
  }

  await Promise.all(removingPromises);

  // Clone the project into the directory (with the appropriate filter)
  const cloneOptions = {
    targetDir,
    branchId,
    projectId,
    ignorePatterns: [new RegExp(".*")], // Temporary ignore all files pattern
    filterFiles: projectFiles.map((file) => file.path), // Only clone files that exist in the project
  };
  await clone(cloneOptions);
}

async function isDirty(
  targetDir: string,
  projectFiles: ValTown.Projects.FileListResponse[],
  ignorePatterns: RegExp[],
): Promise<boolean> {
  for (const file of projectFiles) {
    const filePath = join(targetDir, file.path);

    if (ignorePatterns.some((pattern) => pattern.test(filePath))) {
      continue;
    }

    try {
      const stats = await Deno.stat(filePath);
      const fileModifiedTime = new Date(stats.mtime ?? 0);

      if (fileModifiedTime > new Date(file.updatedAt)) {
        // The file has been modified locally after the last update
        return true;
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        // If there's an error other than file not found, rethrow it
        throw error;
      }
    }
  }
  return false;
}
