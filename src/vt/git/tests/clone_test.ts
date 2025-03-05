import { clone } from "~/vt/git/clone.ts";
import { withTempDir } from "~/vt/git/utils.ts";
import { assertEquals } from "@std/assert";
import { verifyProjectStructure } from "~/vt/git/tests/utils.ts";
import { testCases } from "~/vt/git/tests/cases.ts";

for (const testCase of testCases) {
  Deno.test({
    name: "test cloning " + testCase.name,
    permissions: {
      read: true,
      write: true,
      net: true,
    },
    async fn() {
      const { tempDir, cleanup } = await withTempDir("vt_clone_test");

      try {
        // Perform the clone operation
        await clone({
          targetDir: tempDir,
          projectId: testCase.projectId,
          branchId: testCase.branchId,
          version: testCase.version,
        });

        // Verify project structure
        const structureValid = await verifyProjectStructure(
          tempDir,
          testCase.expectedInodes,
        );

        assertEquals(
          structureValid,
          true,
          "Project structure verification failed",
        );
      } finally {
        await cleanup();
      }
    },
  });
}
