import { join } from "@std/path";

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
      const actualType = stat.isFile ? "file" : "directory";
      throw new Error(
        `Path "${expected.path}" exists but is a ${actualType} when it should be a ${expected.type}`,
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
  // Check all expected files/directories exist with correct properties
  for (const inode of expectedInodes) {
    const fullPath = join(basePath, inode.path);
    await assertInodeExists(fullPath, inode);
  }

  return true;
}
