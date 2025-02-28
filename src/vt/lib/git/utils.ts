import sdk from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";

/**
 * Retrieves the ID of the main branch for a given project.
 *
 * @param projectId - The ID of the project to retrieve the main branch from.
 * @returns A promise that resolves to the branch ID as a string.
 * @throws An error if the main branch is not found.
 */
export async function getMainBranchId(projectId: string): Promise<string> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name === DEFAULT_BRANCH_NAME) return branch.id;
  }

  throw new Error(`Branch "${DEFAULT_BRANCH_NAME}" not found`);
}

/**
 * Checks if a directory has any files modified since a given time.
 *
 * @param dir - The directory to check.
 * @param since - The Date to compare file modification times against.
 * @param exclude - An array of regular expressions to match file names that should be excluded from the check.
 * @returns A promise that resolves to a boolean indicating whether any files have been modified since the given time.
 */
export async function isDirty(
  dir: string,
  since: Date,
  exclude: RegExp[],
): Promise<boolean> {
  for await (const entry of Deno.readDir(dir)) {
    // Skip directories
    if (entry.isDirectory) continue;

    // Check if file should be excluded
    if (exclude.some((regex) => regex.test(entry.name))) {
      continue;
    }

    // Get file info
    const fileInfo = await Deno.stat(`${dir}/${entry.name}`);

    // Check modification time
    if (fileInfo.mtime && fileInfo.mtime > since) {
      return true;
    }
  }

  return false;
}

/**
 * Create a temporary directory for testing.
 *
 * @param label - A label to append to the temporary directory name.
 * @returns An object containing the path to the temporary directory and a cleanup function to remove it.
 */
export async function getTestDir(
  label: string,
): Promise<{ testDir: string; cleanup: () => void }> {
  const testDir = await Deno.makeTempDir({
    prefix: "vt_",
    suffix: `_${label}`,
  });

  return {
    testDir,
    cleanup: async () => await Deno.remove(testDir, { recursive: true }),
  };
}
