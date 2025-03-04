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
  version,
  ignoreGlobs,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  version: number;
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
  const removalPromises = statusResult.not_modified
    .map((file) => path.join(targetDir, file.path))
    .map(async (filePath) => {
      try {
        await Deno.remove(filePath);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    });
  await Promise.all(removalPromises);

  // Clone fresh files from the project
  await clone({
    targetDir,
    projectId,
    branchId,
    version,
    ignoreGlobs,
  });
}

export interface ExpectedProjectInode {
  path: string;
  type: "file" | "directory";
  content?: string;
}

async function assertInodeExists(
  fullPath: string,
  expected: ExpectedProjectInode,
) {
  try {
    const stat = await Deno.stat(fullPath);
    const isCorrectType = expected.type === "file"
      ? stat.isFile
      : stat.isDirectory;

    if (!isCorrectType) {
      throw new Error(
        `Path "${expected.path}" exists but is a ${
          expected.type === "file" ? "directory" : "file"
        } when it should be a ${expected.type}`,
      );
    }

    if (expected.type === "file" && expected.content !== undefined) {
      const actualContent = await Deno.readTextFile(fullPath);
      if (actualContent !== expected.content) {
        throw new Error(
          `Content mismatch for file "${expected.path}"\n` +
            `Expected: ${JSON.stringify(expected.content)}\n` +
            `Actual: ${JSON.stringify(actualContent)}`,
        );
      }
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Expected path "${expected.path}" does not exist`);
    }
    throw error;
  }
}

/**
 * Verifies the expected file/directory structure exists at the given path
 *
 * @param basePath The root directory to check
 * @param expectedInodes List of expected files/directories and their properties
 * @returns Promise<boolean> true if all paths exist and match expected types/content
 * @throws Detailed error message if any path verification fails
 */
export async function verifyProjectStructure(
  basePath: string,
  expectedInodes: ExpectedProjectInode[],
): Promise<boolean> {
  // First get all actual files/directories
  const actualPaths = new Set<string>();

  // Convert expected paths to a set for comparison
  const expectedPaths = new Set(expectedInodes.map((inode) => inode.path));

  // Check for unexpected files/directories
  for (const actualPath of actualPaths) {
    if (!expectedPaths.has(actualPath)) {
      throw new Error(`Unexpected file or directory found: "${actualPath}"`);
    }
  }

  // Check all expected files/directories exist with correct properties
  for (const inode of expectedInodes) {
    const fullPath = path.join(basePath, inode.path);
    await assertInodeExists(fullPath, inode);
  }

  return true;
}
