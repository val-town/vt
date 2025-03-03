import { clone } from "~/vt/git/clone.ts";
import { withTempDir } from "~/vt/git/utils.ts";
import * as path from "@std/path";
import { assertEquals } from "@std/assert";

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

Deno.test({
  name: "clone val town project test",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    const { tempDir, cleanup } = await withTempDir("vt_clone");

    // The project and branch IDs to test cloning
    // https://www.val.town/x/wolf/vtCliTestProj
    const projectId = "b95fe488-f4de-11ef-97f1-569c3dd06744";
    const branchId = "b9602cf4-f4de-11ef-97f1-569c3dd06744";
    const version = 8;

    // Do the clone
    await clone({
      targetDir: tempDir,
      projectId,
      branchId,
      version,
    });

    // This is what we should get (we know apriori)
    const expectedInodes: ExpectedProjectInode[] = [
      {
        path: "proudLimeGoose.http.tsx",
        type: "file",
        content: "// Example Content",
      },
      {
        path: "merryCopperAsp.script.tsx",
        type: "file",
        content: "",
      },
      {
        path: "thoughtfulPeachPrimate",
        type: "directory",
      },
      {
        path: path.join(
          "thoughtfulPeachPrimate",
          "clearAquamarineSmelt.cron.tsx",
        ),
        type: "file",
        content: "",
      },
      {
        path: path.join("thoughtfulPeachPrimate", "tirelessHarlequinSmelt"),
        type: "file",
        content: "",
      },
    ];

    // Now make sure we got what we wanted
    const structureValid = await verifyProjectStructure(
      tempDir,
      expectedInodes,
    );
    assertEquals(structureValid, true, "Project structure verification failed");

    await cleanup();
  },
});
