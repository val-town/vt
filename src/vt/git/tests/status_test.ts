import { FileStatus, status, StatusResult } from "~/vt/git/status.ts";
import * as path from "@std/path";
import { withTempDir } from "~/vt/git/utils.ts";
import { clone } from "~/vt/git/clone.ts";
import { assert } from "@std/assert";
import { testCases } from "~/vt/git/tests/cases.ts";

for (const testCase of testCases) {
  for (const branchId in testCase.branches) {
    const branchData = testCase.branches[branchId];

    Deno.test({
      name: `test status ${testCase.name} - Branch: ${branchId}`,
      permissions: {
        read: true,
        write: true,
        net: true,
      },
      async fn() {
        const { tempDir, cleanup } = await withTempDir("vt_status_test");

        try {
          // Clone the project
          await clone({
            targetDir: tempDir,
            projectId: testCase.projectId,
            branchId: branchId, // Use correct branch ID
            version: branchData.version, // Use branch-specific version
          });

          // We trust initial status is correct since clone is already tested

          // Modify specified files
          for (
            const { path: filePath, newContent } of branchData.modifiedFiles
          ) {
            const fullPath = path.join(tempDir, filePath);
            await Deno.writeTextFile(fullPath, newContent);
          }

          // Delete specified files
          for (const filePath of branchData.deletedFiles) {
            const fullPath = path.join(tempDir, filePath);
            await Deno.remove(fullPath);
          }

          // Check the status
          const result: StatusResult = await status({
            targetDir: tempDir,
            projectId: testCase.projectId,
            branchId: branchId, // Use correct branch ID
            ignoreGlobs: [],
          });

          // Validate modified files
          const modifiedPaths = result.modified.map((f: FileStatus) => f.path);
          for (const { path: modifiedPath } of branchData.modifiedFiles) {
            assert(
              modifiedPaths.includes(modifiedPath),
              `Expected ${modifiedPath} to be reported as modified but it was not.`,
            );
          }

          // Validate deleted files
          const deletedPaths = result.deleted.map((f: FileStatus) => f.path);
          for (const deletedPath of branchData.deletedFiles) {
            assert(
              deletedPaths.includes(deletedPath),
              `Expected ${deletedPath} to be reported as deleted but it was not.`,
            );
          }
        } finally {
          await cleanup();
        }
      },
    });
  }
}
