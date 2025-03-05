import { clone } from "~/vt/git/clone.ts";
import { withTempDir } from "~/vt/git/utils.ts";
import { assertEquals } from "@std/assert";
import { verifyProjectStructure } from "~/vt/git/tests/utils.ts";
import { checkout } from "~/vt/git/checkout.ts";
import { testCases } from "~/vt/git/tests/cases.ts";
import sdk, { branchNameToId } from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";

// Run test for checking out branches that already exist
for (const testCase of testCases) {
  for (const fromBranchId in testCase.branches) {
    for (const toBranchId in testCase.branches) {
      if (fromBranchId === toBranchId) continue; // Skip self-checkout

      const fromBranchData = testCase.branches[fromBranchId];
      const toBranchData = testCase.branches[toBranchId];

      // Test checking out from each branch to each branch in each test case.
      Deno.test({
        name:
          `test checkout from ${fromBranchId} to ${toBranchId} in ${testCase.name}`,
        permissions: {
          read: true,
          write: true,
          net: true,
        },
        async fn() {
          const { tempDir, cleanup } = await withTempDir("vt_checkout_test");

          try {
            // Clone the "from" branch
            await clone({
              targetDir: tempDir,
              projectId: testCase.projectId,
              branchId: fromBranchId,
              version: fromBranchData.version,
            });
            // Clone already has coverage so we know this works

            // Perform checkout to "toBranch"
            await checkout({
              branchId: toBranchId,
              version: toBranchData.version,
              targetDir: tempDir,
              projectId: testCase.projectId,
              ignoreGlobs: [],
            });

            // Verify project structure after checkout
            const structureValid = await verifyProjectStructure(
              tempDir,
              toBranchData.expectedInodes,
            );

            assertEquals(
              structureValid,
              true,
              `Checkout to branch ${toBranchId} failed structure verification`,
            );
          } finally {
            await cleanup();
          }
        },
      });
    }
  }
}

// Test checking out new branches that do not exist
Deno.test({
  name: "test creating new branch",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    // Create a new test project
    const project = await sdk.projects.create({
      privacy: "public",
      name: crypto.randomUUID(),
      description: "test project",
    });

    // Get the main branch ID to fork from
    const mainBranchId = await branchNameToId(project.id, DEFAULT_BRANCH_NAME);
    const mainBranch = await sdk.projects.branches.retrieve(
      project.id,
      mainBranchId,
    );

    const newBranchName = `test-branch-${crypto.randomUUID()}`;
    const { tempDir, cleanup } = await withTempDir("vt_checkout_test");

    try {
      // Clone the "from" branch
      await clone({
        targetDir: tempDir,
        projectId: project.id,
        branchId: mainBranchId,
        version: mainBranch.version,
      });

      // Checkout new branch (should CREATE the branch)
      await checkout({
        targetDir: tempDir,
        projectId: project.id,
        ignoreGlobs: [],
        forkedFrom: mainBranch.id,
        name: newBranchName,
        version: mainBranch.version,
      });

      try {
        await branchNameToId(project.id, newBranchName);
      } catch {
        throw new Error("Branch was not created successfully");
      }
    } finally {
      await cleanup();
      // TODO `await sdk.projects.delete(project.id);` (this API endpoint
      // doesn't exist yet thoguh)
    }
  },
});
