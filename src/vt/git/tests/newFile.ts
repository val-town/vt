import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import * as path from "@std/path";
import { clone } from "~/vt/git/clone.ts";
import { verifyProjectStructure } from "~/vt/git/pull.ts";
import { StatusResult, status, FileStatus } from "~/vt/git/status.ts";
import { withTempDir } from "~/vt/git/utils.ts";
import { testCases } from "~/vt/git/tests/cases.ts";

for (const testCase of testCases) {
  Deno.test({
    name: testCase.name,
    permissions: {
      read: true,
      write: true,
      net: true,
    },
    async fn() {
      const { tempDir, cleanup } = await withTempDir("vt_clone");

      // Clone the project
      await clone({
        targetDir: tempDir,
        projectId: testCase.projectId,
        branchId: testCase.branchId,
        version: testCase.version,
      });

      // Verify the initial project structure
      const initialStructureValid = await verifyProjectStructure(
        tempDir,
        testCase.expectedInodes
      );
      assertEquals(initialStructureValid, true, "Initial project structure verification failed");

      // Modify specified files
      for (const { path: filePath, newContent } of testCase.modifiedFiles) {
        const fullPath = path.join(tempDir, filePath);
        await Deno.writeTextFile(fullPath, newContent);
      }

      // Delete specified files
      for (const filePath of testCase.deletedFiles) {
        const fullPath = path.join(tempDir, filePath);
        await Deno.remove(fullPath);
      }

      // Check the status
      const result: StatusResult = await status({
        targetDir: tempDir,
        projectId: testCase.projectId,
        branchId: testCase.branchId,
        ignoreGlobs: [],
      });

      // Validate modified files
      const modifiedPaths = result.modified.map((f: FileStatus) => f.path);
      for (const { path: modifiedPath } of testCase.modifiedFiles) {
        assert(
          modifiedPaths.includes(modifiedPath),
          `Expected ${modifiedPath} to be reported as modified but it was not.`
        );
      }

      // Validate deleted files
      const deletedPaths = result.deleted.map((f: FileStatus) => f.path);
      for (const deletedPath of testCase.deletedFiles) {
        assert(
          deletedPaths.includes(deletedPath),
          `Expected ${deletedPath} to be reported as deleted but it was not.`
        );
      }

      await cleanup();
    },
  });
}

