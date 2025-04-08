import ValTown from "@valtown/sdk";
import sdk from "~/sdk.ts";
import { copy, ensureDir, exists } from "@std/fs";
import { dirname, join } from "@std/path";

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
