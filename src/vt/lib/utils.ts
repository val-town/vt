import { shouldIgnore } from "~/vt/lib/paths.ts";
import ValTown from "@valtown/sdk";
import sdk from "~/sdk.ts";
import { copy, ensureDir } from "@std/fs";
import type { FileStateChanges } from "~/vt/lib/pending.ts";
import { dirname, join } from "@std/path";

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
 * Executes an operation in a temporary directory and ensures cleanup.
 *
 * @param op Function that takes a temporary directory path and returns a Promise
 * @param tmpLabel Optional prefix for the temporary directory name
 * @returns Promise that resolves to the result of the operation
 */
export async function doWithTempDir<T>(
  op: (tmpDir: string) => Promise<T>,
  tmpLabel?: string,
): Promise<T> {
  const { tempDir, cleanup } = await withTempDir(tmpLabel);

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
 * @param {string[]} gitignoreRules - Gitignore rules
 */
export async function cleanDirectory(
  directory: string,
  gitignoreRules: string[],
): Promise<void> {
  const filesToRemove = Deno.readDirSync(directory)
    .filter((entry) => !shouldIgnore(entry.name, gitignoreRules))
    .map((entry) => ({
      path: join(directory, entry.name),
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
 * @param {FileStateChanges} fileStateChanges - The current file state changes
 */
export function isDirty(fileStateChanges: FileStateChanges): boolean {
  return fileStateChanges.modified.length > 0;
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
    } catch (error) {
      if (error instanceof ValTown.APIError) {
        if (error.status != 409) {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
}

/**
 * Determines the total number of changes, not including not modified files,
 * from a StatusResult.
 */
export function getTotalChanges(status: FileStateChanges): number {
  return Object
    .entries(status)
    .filter(([type]) => type !== "not_modified")
    .reduce((sum, [, files]) => sum + files.length, 0);
}

export async function isFileModified(
  {
    path,
    targetDir,
    originalPath,
    projectId,
    branchId,
    version,
    localMtime,
    projectMtime,
  }: {
    path: string;
    targetDir: string;
    originalPath: string;
    projectId: string;
    branchId: string;
    version: number;
    localMtime: number;
    projectMtime: number;
  },
): Promise<boolean> {
  // First use the mtime as a heuristic to avoid unnecessary content checks
  if (localMtime <= projectMtime) {
    return false;
  }

  // If mtime indicates a possible change, check content
  const projectFileContent = await sdk.projects.files.getContent(
    projectId,
    {
      path,
      branch_id: branchId,
      version,
    },
  ).then((resp) => resp.text());

  // For some reason the local paths seem to have an extra newline
  const localFileContent = await Deno.readTextFile(
    join(targetDir, originalPath),
  );

  return projectFileContent !== localFileContent;
}
