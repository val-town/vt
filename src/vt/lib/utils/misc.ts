import { ensureDir, exists, walk } from "@std/fs";
import { join, relative } from "@std/path";

/**
 * Creates a temporary directory and returns it with a cleanup function.
 *
 * @param options - Options for the temporary directory
 * @param options.prefix - Optional prefix for the temporary directory name (defaults to "vt_")
 * @returns Promise that resolves to temporary directory path and cleanup function
 */
export async function withTempDir(
  options: {
    /** Optional prefix for the temporary directory name */
    prefix?: string;
  } = {},
): Promise<{ tempDir: string; cleanup: () => Promise<void> }> {
  const { prefix = "vt_" } = options;

  // Use prefix normally with a random suffix
  const tempDir = await Deno.makeTempDir({ prefix });

  return {
    tempDir,
    cleanup: async () => {
      if (await exists(tempDir)) {
        await Deno.remove(tempDir, { recursive: true });
      }
    },
  };
}

/**
  * Create a directory atomically by first doing logic to create it in a temp
  * directory, and then moving it to a destination afterwards.
  *
  * @param op - The function to run with access to the temp dir. Returns a result to be propagated and whether to copy
 the files over.
  * @param options - Options for the atomic operation
  * @param options.targetDir - The directory to eventually send the output to
  * @param options.prefix - Optional prefix for the temporary directory name
  * @returns Promise that resolves to the result of the operation
  */
export async function doAtomically<T>(
  op: (tmpDir: string) => Promise<[T, boolean]>,
  options: { targetDir: string; prefix?: string },
): Promise<T> {
  const { targetDir, ...tempDirOptions } = options;
  const { tempDir, cleanup } = await withTempDir(tempDirOptions);

  let result: T;
  try {
    const [opResult, copyBack] = await op(tempDir);
    result = opResult;

    if (copyBack) {
      await ensureDir(targetDir);
      await gracefulRecursiveCopy(tempDir, targetDir, {
        overwrite: true,
        preserveTimestamps: true,
      });
    }
  } finally {
    cleanup();
  }
  return result;
}

/**
 * Determines if a file has been modified compared to its original version.
 *
 * This function uses a two-step approach to check for modifications:
 * 1. First, it compares modification timestamps as a quick heuristic
 * 2. If timestamps suggest a change, it performs a full content comparison
 *
 * @returns {boolean} True if the file has been modified, false otherwise
 */
export function isFileModified({
  localContent,
  localMtime,
  remoteContent,
  remoteMtime,
  where,
}: {
  localContent: string;
  localMtime: number;
  remoteContent: string;
  remoteMtime: number;
  where: "local" | "remote" | "both";
}): boolean {
  // If the local mtime is not newer than the remote mtime, it hasn't changed
  if (where === "local" && localMtime <= remoteMtime) return false;
  // Likewise, if the remote mtime is not newer than the local mtime, it hasn't changed
  if (where === "remote" && remoteMtime <= localMtime) return false;
  // If both mtime are the same, no need to check content
  if (where === "both" && localMtime === remoteMtime) return false; 

  // If mtime indicates a possible change, check content
  return localContent !== remoteContent;
}

/**
 * Executes an operation in a temporary directory and ensures cleanup.
 *
 * @param op - Function that takes a temporary directory path and returns a Promise
 * @param options - Options for the operation
 * @param options.prefix - Optional prefix for the temporary directory name (defaults to "vt_")
 * @returns Promise that resolves to the result of the operation
 */

export async function doWithTempDir<T>(
  op: (tmpDir: string) => Promise<T>,
  options: { prefix?: string } = { prefix: "vt_" },
): Promise<T> {
  const { tempDir, cleanup } = await withTempDir(options);

  try {
    return await op(tempDir);
  } finally {
    await cleanup();
  }
}

/**
 * Recursively copies files and directories from `src` to `dst`.
 *
 * Any errors during copying (e.g. permission issues, file locks) are caught and stored,
 * and the function continues processing remaining files.
 *
 * @param src Source directory path
 * @param dst Destination directory path
 * @param options Options for the copy operation
 * @param options.overwrite Whether to overwrite existing files (default: false)
 * @param options.preserveTimestamps Whether to preserve file timestamps (default: true)
 * @returns An object containing a list of file paths that failed to copy
 */
export async function gracefulRecursiveCopy(
  src: string,
  dst: string,
  options: {
    overwrite?: boolean;
    preserveTimestamps?: boolean;
  } = { overwrite: false, preserveTimestamps: false },
): Promise<{ failed: string[] }> {
  // Collect all entries using Array.fromAsync
  const entries = await Array.fromAsync(walk(src));

  // Process directories first (synchronously) to ensure they exist
  const dirEntries = entries.filter((entry) => entry.isDirectory);
  for (const entry of dirEntries) {
    const relPath = relative(src, entry.path);
    const dstPath = join(dst, relPath);
    try {
      await ensureDir(dstPath);
    } catch {
      // Skip reporting directory failures as they'll be caught during file operations
    }
  }

  // Then process all files concurrently with Promise.all
  const fileEntries = entries.filter((entry) => entry.isFile);
  const copyResults = await Promise.all(
    fileEntries.map(async (entry) => {
      const relPath = relative(src, entry.path);
      const dstPath = join(dst, relPath);

      try {
        await ensureDir(join(dstPath, ".."));
        await Deno.copyFile(entry.path, dstPath);

        if (options.preserveTimestamps) {
          const entryStat = await Deno.stat(entry.path);
          if (entryStat.mtime) {
            await Deno.utime(
              dstPath,
              entryStat.atime || entryStat.mtime,
              entryStat.mtime,
            );
          }
        }
        return null; // Success
      } catch {
        return entry.path; // Failed path
      }
    }),
  );

  // Filter out successful operations (null values) to get the failed paths
  const failed = copyResults.filter(Boolean) as string[];

  return { failed };
}
