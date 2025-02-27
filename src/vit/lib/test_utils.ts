import { walk } from "@std/fs/walk";
import { join } from "jsr:@std/path/join";

export async function getTestDir(
  label: string,
): Promise<{ testDir: string; cleanup: () => void }> {
  const testDir = await Deno.makeTempDir({
    prefix: "vt_",
    suffix: `_${label}`,
  });

  return { testDir, cleanup: () => Deno.remove(testDir, { recursive: true }) };
}

export interface ExpectedProjectInode {
  path: string;
  type: "file" | "directory";
  content?: string;
}

/**
 * Verifies the expected file/directory structure exists at the given path
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
  for await (const entry of walk(basePath)) {
    // Skip the base directory itself and normalize path
    const relativePath = entry.path.slice(basePath.length + 1);
    if (relativePath) {
      // Normalize path separators for cross-platform compatibility
      actualPaths.add(relativePath.replace(/\\/g, "/"));
    }
  }

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

    const stat = await Deno.stat(fullPath);
    const isCorrectType = inode.type === "file"
      ? stat.isFile
      : stat.isDirectory;

    if (!isCorrectType) {
      throw new Error(
        `Path "${inode.path}" exists but is a ${
          inode.type === "file" ? "directory" : "file"
        } when it should be a ${inode.type}`,
      );
    }

    // If content checking is requested, verify file contents
    if (inode.type === "file") {
      const content = await Deno.readTextFile(fullPath);
      if (content !== (inode.content || "")) {
        throw new Error(`Content mismatch for file "${inode.path}"`);
      }
    }
  }

  return true;
}
