import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { join } from "@std/path";
import sdk from "~/sdk.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assert, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";

Deno.test({
  name: "checkout with remote modifications on current branch is allowed",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch: mainBranch }) => {
        await t.step("set up the state of the val", async () => {
          // Create initial file on main branch
          await sdk.vals.files.create(
            val.id,
            {
              path: "main.ts",
              content: "// Main branch",
              branch_id: mainBranch.id,
              type: "script",
            },
          );

          // Create a feature branch
          const featureBranch = await sdk.vals.branches.create(
            val.id,
            { name: "feature-branch", branchId: mainBranch.id },
          );

          // Add a file to feature branch
          await sdk.vals.files.create(
            val.id,
            {
              path: "feature.ts",
              content: "// Feature",
              branch_id: featureBranch.id,
              type: "script",
            },
          );
        });

        const fullPath = join(tmpDir, val.name);

        await t.step("clone the val and modify it", async () => {
          // Clone the val (defaults to main branch)
          await runVtCommand(
            ["clone", val.name, "--no-editor-files"],
            tmpDir,
          );

          // Make a remote change to main branch after cloning
          await sdk.vals.files.update(
            val.id,
            {
              branch_id: mainBranch.id,
              path: "main.ts",
              content: "// Modified main branch",
            },
          );
        });

        // Now try checking out to feature branch
        // This should succeed without requiring force flag or showing dirty warning
        const [checkoutOutput] = await runVtCommand([
          "checkout",
          "feature-branch",
        ], fullPath);

        await t.step("check the checkout output", async () => {
          // Should successfully switch branches without warning about dirty state
          assertStringIncludes(
            checkoutOutput,
            'Switched to branch "feature-branch"',
          );

          // Should not contain warnings about dirty working directory
          assert(
            !checkoutOutput.includes("proceed with checkout anyway"),
            "Checkout should not warn about dirty working directory with remote changes",
          );

          // Verify we're on feature branch by checking for feature file
          assert(
            await exists(join(fullPath, "feature.ts")),
            "feature-file.js should exist after checkout",
          );

          // Check status to confirm we're on feature branch
          const [statusOutput] = await runVtCommand(["status"], fullPath);
          assertStringIncludes(statusOutput, "On branch feature-branch@");
        });
      });
    });
  },
  sanitizeExit: false,
  sanitizeResources: false,
});

Deno.test({
  name: "checkout -b preserves local unpushed changes",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch: mainBranch }) => {
        let fullPath: string;
        let originalFilePath: string;
        let newFilePath: string;

        await t.step("create file on main branch", async () => {
          await sdk.vals.files.create(
            val.id,
            {
              path: "original.txt",
              content: "original content",
              branch_id: mainBranch.id,
              type: "file",
            },
          );
        });

        await t.step("clone val and make local changes", async () => {
          await runVtCommand(["clone", val.name, "--no-editor-files"], tmpDir);
          fullPath = join(tmpDir, val.name);
          originalFilePath = join(fullPath, "original.txt");

          assert(
            await exists(originalFilePath),
            "original file should exist after clone",
          );

          newFilePath = join(fullPath, "new-file.txt");
          await Deno.writeTextFile(newFilePath, "new file content");
          await Deno.writeTextFile(originalFilePath, "modified content");
        });

        await t.step("create and checkout new branch with -b", async () => {
          const [checkoutOutput] = await runVtCommand([
            "checkout",
            "-b",
            "feature-with-changes",
          ], fullPath);

          assertStringIncludes(
            checkoutOutput,
            'Created and switched to new branch "feature-with-changes"',
          );
        });

        await t.step("verify local changes are preserved", async () => {
          assert(
            await exists(newFilePath),
            "new file should still exist after branch creation",
          );

          const newFileContent = await Deno.readTextFile(newFilePath);
          assert(
            newFileContent === "new file content",
            "new file content should be preserved",
          );

          const modifiedFileContent = await Deno.readTextFile(originalFilePath);
          assert(
            modifiedFileContent === "modified content",
            "modified file content should be preserved",
          );
        });

        await t.step("push changes to new branch", async () => {
          await runVtCommand(["push"], fullPath);
        });

        await t.step(
          "checkout main branch and verify changes aren't there",
          async () => {
            await runVtCommand(["checkout", "main"], fullPath);

            const mainBranchContent = await Deno.readTextFile(originalFilePath);
            assert(
              mainBranchContent === "original content",
              "original file should have original content on main branch",
            );

            assert(
              !(await exists(newFilePath)),
              "new file should not exist on main branch",
            );
          },
        );
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});

Deno.test({
  name: "check out to existing branch",
  permissions: "inherit",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        // Create initial file on main branch
        await sdk.vals.files.create(
          val.id,
          {
            path: "main-file.js",
            content: "console.log('Main branch file');",
            branch_id: branch.id,
            type: "file",
          },
        );

        // Create a new branch using SDK
        const newBranch = await sdk.vals.branches.create(
          val.id,
          { name: "feature-branch", branchId: branch.id },
        );

        // Create a file on the new branch
        await sdk.vals.files.create(
          val.id,
          {
            path: "feature-file.js",
            content: "console.log('Feature branch file');",
            branch_id: newBranch.id,
            type: "file",
          },
        );

        // Clone the val (defaults to main branch)
        await runVtCommand(["clone", val.name, "--no-editor-files"], tmpDir);
        const fullPath = join(tmpDir, val.name);

        // Ensure the main file exists
        assert(
          await exists(join(fullPath, "main-file.js")),
          "main-file.js should exist after clone",
        );

        // Feature file should not exist yet
        assert(
          !(await exists(join(fullPath, "feature-file.js"))),
          "feature-file.js should not exist on main branch",
        );

        // Check out to the feature branch
        const [checkoutOutput] = await runVtCommand([
          "checkout",
          "feature-branch",
        ], fullPath);
        assertStringIncludes(
          checkoutOutput,
          'Switched to branch "feature-branch"',
        );

        // Now the feature file should exist
        assert(
          await exists(join(fullPath, "feature-file.js")),
          "feature-file.js should exist after checkout",
        );

        // Check status on feature branch
        const [statusOutput] = await runVtCommand(["status"], fullPath);
        assertStringIncludes(statusOutput, "On branch feature-branch@");
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});

Deno.test({
  name: "create new branch with -b",
  permissions: "inherit",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        await sdk.vals.files.create(
          val.id,
          {
            path: "main.tsx",
            content: "console.log('Main branch file');",
            branch_id: branch.id,
            type: "script",
          },
        );

        await runVtCommand(["clone", val.name, "--no-editor-files"], tmpDir);
        const fullPath = join(tmpDir, val.name);

        const [checkoutOutput] = await runVtCommand([
          "checkout",
          "-b",
          "new-branch",
        ], fullPath);
        assertStringIncludes(
          checkoutOutput,
          'Created and switched to new branch "new-branch"',
        );

        assert(
          await exists(join(fullPath, "main.tsx")),
          "main.tsx should exist on new branch",
        );

        const [statusOutput] = await runVtCommand(["status"], fullPath);
        assertStringIncludes(statusOutput, "On branch new-branch@");

        await Deno.writeTextFile(
          join(fullPath, "new.tsx"),
          "// Branch file",
        );

        await runVtCommand(["push"], fullPath);
        await runVtCommand(["checkout", "main"], fullPath);

        assert(
          !(await exists(join(fullPath, "new.tsx"))),
          "new.tsx should not exist on main branch",
        );

        const [mainStatusOutput] = await runVtCommand(["status"], fullPath);
        assertStringIncludes(mainStatusOutput, "On branch main@");
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});

Deno.test({
  name: "warning on modified files",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        let fullPath: string;

        await t.step("create initial file on main branch", async () => {
          await sdk.vals.files.create(
            val.id,
            {
              path: "shared.ts",
              content: "// Original content",
              branch_id: branch.id,
              type: "script",
            },
          );
        });

        await t.step("create and modify file on feature branch", async () => {
          // Create a feature branch
          const featureBranch = await sdk.vals.branches.create(
            val.id,
            { name: "feature", branchId: branch.id },
          );

          // Modify the file on feature branch
          await sdk.vals.files.update(
            val.id,
            {
              branch_id: featureBranch.id,
              path: "shared.ts",
              content: "// Modified content on feature branch",
            },
          );
        });

        await t.step("clone project and modify file locally", async () => {
          // Clone the project (defaults to main branch)
          await runVtCommand(["clone", val.name, "--no-editor-files"], tmpDir);
          fullPath = join(tmpDir, val.name);

          // Modify the shared file locally while on main branch
          await Deno.writeTextFile(
            join(fullPath, "shared.ts"),
            "// Local modification",
          );
        });

        await t.step("checkout with warning about local changes", async () => {
          // Try checking out to feature branch - should see warning about local changes
          const [checkoutOutput, _] = await runVtCommand(
            ["checkout", "feature"],
            fullPath,
          );

          // Should see warning about dangerous changes
          assertStringIncludes(
            checkoutOutput,
            "proceed with checkout anyway",
          );
          assertStringIncludes(checkoutOutput, "shared.ts");
        });

        await t.step("force checkout overrides local changes", async () => {
          // Try with force option
          const [forceCheckoutOutput] = await runVtCommand([
            "checkout",
            "main",
            "-f",
          ], fullPath);

          assertStringIncludes(
            forceCheckoutOutput,
            'Switched to branch "main"',
          );
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "checkout to current branch shows 'already on branch' message",
  permissions: "inherit",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        // Create initial file on main branch
        await sdk.vals.files.create(
          val.id,
          {
            path: "main-file.js",
            content: "console.log('Main branch file');",
            branch_id: branch.id,
            type: "file",
          },
        );

        // Clone the val (defaults to main branch)
        await runVtCommand(["clone", val.name, "--no-editor-files"], tmpDir);
        const fullPath = join(tmpDir, val.name);

        // Try checking out to main branch while already on main
        const [checkoutOutput] = await runVtCommand([
          "checkout",
          "main",
        ], fullPath);

        // Should indicate we're already on the branch
        assertStringIncludes(
          checkoutOutput,
          'You are already on branch "main"',
        );

        // Verify we're still on main branch
        const [statusOutput] = await runVtCommand(["status"], fullPath);
        assertStringIncludes(statusOutput, "On branch main@");
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});
