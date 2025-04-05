import ValTown from "@valtown/sdk";
import sdk from "~/sdk.ts";
import { copy, ensureDir, exists } from "@std/fs";
import { dirname } from "@std/path";

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
      await copy(tempDir, targetDir, {
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
 * Ensures that a directory path exists within a project in Valtown.
 * This function creates each directory in the specified path if it doesn't already exist.
 *
 * @param {string} projectId - The ID of the project where the directory should be ensured.
 * @param {string} branchId - The ID of the branch where the directory should be created.
 * @param {string} filePath - The file path for which directories need to be ensured.
 * @returns {Promise<void>} A promise that resolves when all necessary directories are created.
 */
export async function ensureValtownDir(
  projectId: string,
  branchId: string,
  filePath: string,
): Promise<void> {
  const dirPath = dirname(filePath);

  // If path is "." (current directory) or empty, no directories need to be created
  if (dirPath === "." || dirPath === "") {
    return;
  }

  // Split the path into segments
  const segments = dirPath.split("/");
  let currentPath = "";

  // Create each directory in the path if it doesn't exist
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === "") continue;

    currentPath += (currentPath ? "/" : "") + segments[i];

    // Create directory - content can be null, empty string, or omitted for directories
    try {
      await sdk.projects.files.create(
        projectId,
        {
          type: "directory",
          path: currentPath,
          branch_id: branchId,
          content: null,
        },
      );
    } catch (e) {
      if (e instanceof ValTown.APIError) {
        if (e.status != 409) throw e;
      } else throw e;
    }
  }
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
  srcContent,
  srcMtime,
  dstContent,
  dstMtime,
}: {
  srcContent: string;
  srcMtime: number;
  dstContent: string;
  dstMtime: number;
}): boolean {
  // First use the mtime as a heuristic to avoid unnecessary content checks
  if (srcMtime === dstMtime) return false;

  // If mtime indicates a possible change, check content
  return srcContent !== dstContent;
}
