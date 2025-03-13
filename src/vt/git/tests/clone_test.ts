import { clone } from "~/vt/git/clone.ts";
import { doWithTempDir } from "~/vt/git/utils.ts";
import { assertEquals } from "@std/assert";
import { verifyProjectStructure } from "~/vt/git/tests/utils.ts";
import { testCases } from "~/vt/git/tests/cases.ts";

for (const testCase of testCases) {
  for (const branchId in testCase.branches) {
    const branchData = testCase.branches[branchId];

    Deno.test({
      name: `test cloning ${testCase.name} - Branch: ${branchId}`,
      permissions: {
        read: true,
        write: true,
        net: true,
      },
      async fn() {
        await doWithTempDir(async (tempDir) => {
          // Perform the clone operation
          await clone({
            targetDir: tempDir,
            projectId: testCase.projectId,
            branchId: branchId, // Use correct branchId
            version: branchData.version, // Use correct version
          });

          // Verify project structure
          const structureValid = await verifyProjectStructure(
            tempDir,
            branchData.expectedInodes, // Use branch-specific expected inodes
          );

          assertEquals(
            structureValid,
            true,
            "Project structure verification failed",
          );
        }, "vt_clone_test");
      },
    });
  }
}
