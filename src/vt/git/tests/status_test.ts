import { FileStatus, status, StatusResult } from "../status.ts";
import * as path from "jsr:@std/path@^1.0.8";
import { doWithTempDir } from "../utils.ts";
import { clone } from "../clone.ts";
import { assert } from "jsr:@std/assert@^1.0.0";
import { TestCaseBranchData, testCases } from "./cases.ts";

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
        await doWithTempDir(async (tempDir) => {
          // Clone the project
          await clone({
            targetDir: tempDir,
            projectId: testCase.projectId,
            branchId: branchId,
            version: branchData.version,
          });

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
          let result: StatusResult = await status({
            targetDir: tempDir,
            projectId: testCase.projectId,
            version: branchData.version,
            branchId: branchId,
            ignoreGlobs: [],
          });

          // Validate initial status
          validateStatus(result, branchData);

          // Update the file timestamps
          const newAtime = new Date();
          const newMtime = new Date();
          for (const { path: filePath } of branchData.modifiedFiles) {
            const fullPath = path.join(tempDir, filePath);
            await Deno.utime(fullPath, newAtime, newMtime);
          }

          // Re-check the status after updating timestamps
          result = await status({
            targetDir: tempDir,
            projectId: testCase.projectId,
            version: branchData.version,
            branchId: branchId,
            ignoreGlobs: [],
          });

          // Validate status remains unchanged
          validateStatus(result, branchData);
        }, "vt_status_test");
      },
    });
  }
}

function validateStatus(result: StatusResult, branchData: TestCaseBranchData) {
  // Validate modified files were modified
  const modifiedPaths = result.modified.map((f: FileStatus) => f.path);
  for (const { path: modifiedPath } of branchData.modifiedFiles) {
    assert(
      modifiedPaths.includes(modifiedPath),
      `Expected ${modifiedPath} to be reported as modified but it was not.`,
    );
  }

  // Validate deleted files were deleted
  const deletedPaths = result.deleted.map((f: FileStatus) => f.path);
  for (const deletedPath of branchData.deletedFiles) {
    assert(
      deletedPaths.includes(deletedPath),
      `Expected ${deletedPath} to be reported as deleted but it was not.`,
    );
  }
}
