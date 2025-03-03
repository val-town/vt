import { clone } from "~/vt/git/clone.ts";
import { withTempDir } from "~/vt/git/utils.ts";
import * as path from "@std/path";
import { assertEquals } from "@std/assert";

export interface ExpectedProjectInode {
  path: string;
  type: "file" | "directory";
  content?: string;
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
        path: "proudLimeGoose.H.tsx",
        type: "file",
        content: "// Example Content",
      },
      {
        path: "merryCopperAsp.S.tsx",
        type: "file",
        content: "updated;",
      },
      {
        path: "thoughtfulPeachPrimate",
        type: "directory",
      },
      {
        path: path.join("thoughtfulPeachPrimate", "philosophicalBlueWolf"),
        type: "directory",
      },
      {
        path: path.join("thoughtfulPeachPrimate", "clearAquamarineSmelt.C.tsx"),
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
