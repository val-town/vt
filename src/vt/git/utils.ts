import sdk from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { StatusResult } from "~/vt/git/status.ts";
import * as path from "@std/path";

/**
 * Retrieves the ID of the default branch for a given project.
 *
 * @param {string} projectId ID of the project
 * @returns Promise that resolves to the branch ID as a string
 * @throws {Error} If the main branch is not found
 */
export async function getMainBranchId(projectId: string): Promise<string> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name === DEFAULT_BRANCH_NAME) return branch.id;
  }

  throw new Error(`Branch "${DEFAULT_BRANCH_NAME}" not found`);
}

/**
 * Creates RegExp patterns from glob patterns for ignoring files.
 *
 * @param {string[]} ignoreGlobs Array of glob patterns to convert
 * @returns {RegExp[]} Array of RegExp patterns
 */
export function createIgnorePatterns(ignoreGlobs: string[]): RegExp[] {
  return ignoreGlobs.map((glob) =>
    path.globToRegExp(glob, { extended: true, globstar: true })
  );
}

/**
 * Checks if a path should be ignored based on ignore patterns.
 *
 * @param {string} filePath Path to check
 * @param {RegExp[]} ignorePatterns Array of RegExp patterns to test against
 * @returns {boolean} True if the path should be ignored
 */
export function shouldIgnorePath(
  filePath: string,
  ignorePatterns: RegExp[],
): boolean {
  return ignorePatterns.some((pattern) => pattern.test(filePath));
}

/**
 * Helper that applies a function to non-ignored files.
 *
 * @param {Function} func Function to execute on non-ignored items
 * @param {string[]} ignoreGlobs Glob patterns for files to ignore
 * @returns {Function} New function you call with a file, which runs on the given file if the file isn't ignored.
 */
export function forNonIgnored<T, U>(
  func: (item: T, ignorePatterns: RegExp[]) => U,
  ignoreGlobs: string[],
): (item: T) => U {
  const ignorePatterns = createIgnorePatterns(ignoreGlobs);
  return (item: T) => func(item, ignorePatterns);
}

/**
 * Create temporary directory for testing with a label.
 *
 * @param label A label to append to the temporary directory name.
 * @returns Promise that resolves to temporary directory and cleanup function.
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

/**
 * Check if the target directory is dirty (has unpushed local changes).
 *
 * @param {StatusResult} statusResult Result of a status operation.
 */
export function isDirty(statusResult: StatusResult): boolean {
  return statusResult.modified.length > 0 ||
    statusResult.created.length > 0 ||
    statusResult.deleted.length > 0;
}
