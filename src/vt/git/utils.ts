import { StatusResult } from "~/vt/git/status.ts";
import * as path from "@std/path";
import { shouldIgnoreGlob } from "~/vt/git/paths.ts";
import { copy, ensureDir } from "@std/fs";

/**
 * Creates a temporary directory and returns it with a cleanup function.
 *
 * @param {string} [prefix] - Optional prefix for the temporary directory name
 * @returns Promise that resolves to temporary directory path and cleanup function
 */
export async function withTempDir(
  prefix: string = "vt_",
): Promise<{ tempDir: string; cleanup: () => Promise<void> }> {
  const tempDir = await Deno.makeTempDir({ prefix });

  return {
    tempDir,
    cleanup: async () => {
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Create a directory atomically by first doing logic to create it in a temp
 * directory, and then moving it to a destination afterwards.
 *
 * @param {string} targetDir - The directory to eventually send the output to.
 */
export async function doAtomically<T>(
  op: (tmpDir: string) => Promise<T>,
  targetDir: string,
  tmpLabel?: string,
): Promise<T> {
  const { tempDir, cleanup } = await withTempDir(tmpLabel);

  let result: T;
  try {
    result = await op(tempDir);
    await ensureDir(targetDir);
    await copy(tempDir, targetDir, {
      overwrite: true,
      preserveTimestamps: true,
    });
  } finally {
    cleanup();
  }
  return result;
}

/**
 * Removes contents from a directory while respecting ignore patterns.
 *
 * @param {string} directory - Directory path to clean
 * @param {string[]} ignoreGlobs - Glob patterns for files to ignore
 */
export async function cleanDirectory(
  directory: string,
  ignoreGlobs: string[],
): Promise<void> {
  const filesToRemove = Deno.readDirSync(directory)
    .filter((entry) => !shouldIgnoreGlob(entry.name, ignoreGlobs))
    .map((entry) => ({
      path: path.join(directory, entry.name),
      isDirectory: entry.isDirectory,
    }));

  await Promise.all(
    filesToRemove.map(({ path: entryPath, isDirectory }) =>
      Deno.remove(entryPath, { recursive: isDirectory })
    ),
  );
}

/**
 * Check if the target directory is dirty (has unpushed local changes).
 *
 * @param {StatusResult} statusResult - Result of a status operation.
 */
export function isDirty(statusResult: StatusResult): boolean {
  return statusResult.modified.length > 0;
}
