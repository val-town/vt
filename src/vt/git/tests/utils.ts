import { join } from "@std/path";
import { walk } from "@std/fs";

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
 * Recursively collects all files and directories under a given path
 *
 * @param dir The directory to scan
 * @param basePath The base path for relative path calculation
 * @param result Set to store collected paths (relative to basePath)
 */
async function collectAllPaths(
  dir: string,
  basePath: string,
): Promise<Set<string>> {
  const paths: string[] = [];

  const relativePath = dir.substring(basePath.length).replace(/^\//, "");
  if (relativePath) paths.push(relativePath);

  for await (const entry of walk(dir)) {
    const entryRelPath = entry.path.substring(basePath.length).replace(
      /^\//,
      "",
    );
    paths.push(entryRelPath);
  }

  return new Set(paths.filter((path) => path !== ""));
}

/**
 * Verifies the expected file/directory structure exists at the given path
 * Also ensures there are no unexpected files or directories
 *
 * @param basePath The root directory to check
 * @param expectedInodes List of expected files/directories and their properties
 * @returns Promise<boolean> true if all paths exist and match expected types/content
 */
export async function verifyProjectStructure(
  basePath: string,
  expectedInodes: ExpectedProjectInode[],
): Promise<boolean> {
  // First get all actual files/directories
  const actualPaths = await collectAllPaths(basePath, basePath);

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
    const fullPath = join(basePath, inode.path);
    await assertInodeExists(fullPath, inode);
  }

  return true;
}
