import { doWithTempDir } from "~/vt/lib/utils.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import sdk, { branchExists } from "~/sdk.ts";
import { checkout } from "~/vt/lib/checkout.ts";
import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { exists } from "@std/fs";

Deno.test({
  name: "test branch checkout",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch: mainBranch }) => {
      // Create a file on main branch
      await sdk.projects.files.create(project.id, {
        path: "main.txt",
        content: "file on main branch",
        branch_id: mainBranch.id,
        type: "file",
      });

      // Create a new branch from main
      const featureBranch = await sdk.projects.branches.create(
        project.id,
        { branchId: mainBranch.id, name: "feature" },
      );

      // Add a file to the feature branch
      await sdk.projects.files.create(project.id, {
        path: "feature.txt",
        content: "file on feature branch",
        branch_id: featureBranch.id,
        type: "file",
      });

      await doWithTempDir(async (tempDir) => {
        // Checkout main branch
        await checkout({
          targetDir: tempDir,
          projectId: project.id,
          branchId: mainBranch.id,
          fromBranchId: mainBranch.id,
          version: mainBranch.version + 1,
          gitignoreRules: [],
        });

        // Verify main file exists but feature file doesn't
        assert(
          await exists(join(tempDir, "main.txt")),
          "main file should exist",
        );
        assert(
          !await exists(join(tempDir, "feature.txt")),
          "feature file shouldn't exist on main",
        );

        // Create untracked file
        await Deno.writeTextFile(
          join(tempDir, "untracked.txt"),
          "untracked content",
        );

        // Checkout feature branch
        const result = await checkout({
          targetDir: tempDir,
          projectId: project.id,
          branchId: featureBranch.id,
          fromBranchId: mainBranch.id,
          version: featureBranch.version + 1,
          gitignoreRules: [],
        });

        // Verify branch info
        assertEquals(result.fromBranch.id, mainBranch.id);
        assertEquals(result.toBranch!.id, featureBranch.id);
        assertEquals(result.createdNew, false);

        // Verify both files exist now
        assert(
          await exists(join(tempDir, "main.txt")),
          "main file should still exist",
        );
        assert(
          await exists(join(tempDir, "feature.txt")),
          "feature file should exist now",
        );
        assert(
          await exists(join(tempDir, "untracked.txt")),
          "untracked file should be preserved",
        );
      }, "vt_checkout_test_");
    });
  },
});

Deno.test({
  name: "test branch creation and checkout",
  permissions: { read: true, write: true, net: true },
  async fn() {
    await doWithNewProject(async ({ project, branch: mainBranch }) => {
      // Create a file on main branch
      await sdk.projects.files.create(project.id, {
        path: "main.txt",
        content: "main branch content",
        branch_id: mainBranch.id,
        type: "file",
      });

      await doWithTempDir(async (tempDir) => {
        // Checkout main branch
        await checkout({
          targetDir: tempDir,
          projectId: project.id,
          branchId: mainBranch.id,
          fromBranchId: mainBranch.id,
          version: mainBranch.version + 1,
        });

        // Create untracked file
        await Deno.writeTextFile(
          join(tempDir, "untracked.txt"),
          "untracked content",
        );

        // Create and checkout a new branch
        const result = await checkout({
          targetDir: tempDir,
          projectId: project.id,
          forkedFromId: mainBranch.id,
          name: "new-feature",
          version: mainBranch.version + 1,
          gitignoreRules: [],
        });

        // Verify branch creation
        assertEquals(result.createdNew, true);
        assertEquals(result.toBranch!.name, "new-feature");

        // Verify files exist
        assert(
          await exists(join(tempDir, "main.txt")),
          "main file should exist in new branch",
        );
        assert(
          await exists(join(tempDir, "untracked.txt")),
          "untracked file should be preserved",
        );

        // Modify file in new branch
        await Deno.writeTextFile(
          join(tempDir, "main.txt"),
          "modified in new branch",
        );

        // Switch back to main branch
        await checkout({
          targetDir: tempDir,
          projectId: project.id,
          branchId: mainBranch.id,
          fromBranchId: result.toBranch!.id,
          version: mainBranch.version + 1,
        });

        // Verify original content
        const mainContent = await Deno.readTextFile(join(tempDir, "main.txt"));
        assertEquals(
          mainContent,
          "main branch content",
          "main file should have original content",
        );
        assert(
          await exists(join(tempDir, "untracked.txt")),
          "untracked file should be preserved",
        );
      }, "vt_checkout_create_test_");
    });
  },
});

Deno.test({
  name: "test untracked files are carried over during checkout",
  permissions: { read: true, write: true, net: true },
  async fn() {
    await doWithNewProject(async ({ project, branch: mainBranch }) => {
      // Create a file on main branch
      await sdk.projects.files.create(project.id, {
        path: "main.txt",
        content: "file on main branch",
        branch_id: mainBranch.id,
        type: "file",
      });

      // Create a new branch from main
      const featureBranch = await sdk.projects.branches.create(
        project.id,
        { branchId: mainBranch.id, name: "feature" },
      );

      await doWithTempDir(async (tempDir) => {
        // Checkout main branch
        await checkout({
          targetDir: tempDir,
          projectId: project.id,
          branchId: mainBranch.id,
          fromBranchId: mainBranch.id,
          version: mainBranch.version + 1,
          gitignoreRules: [],
        });

        // Create a file that's not tracked in any branch
        const untrackedFile = "untracked.txt";
        await Deno.writeTextFile(
          join(tempDir, untrackedFile),
          "untracked content",
        );

        // Create a file that's not in main branch but will be manually added to disk
        // This simulates a file that exists locally but isn't in the "from" branch
        const notInMainFile = "not-in-main.txt";
        await Deno.writeTextFile(
          join(tempDir, notInMainFile),
          "not in main branch",
        );

        // Checkout feature branch
        await checkout({
          targetDir: tempDir,
          projectId: project.id,
          branchId: featureBranch.id,
          fromBranchId: mainBranch.id,
          version: featureBranch.version + 1,
          gitignoreRules: [],
        });

        // Verify untracked file is preserved
        assert(
          await exists(join(tempDir, untrackedFile)),
          "untracked file should be preserved",
        );

        // Verify file not in main branch is carried over
        assert(
          await exists(join(tempDir, notInMainFile)),
          "file not in 'from' branch should be carried over to destination branch",
        );

        const content = await Deno.readTextFile(join(tempDir, notInMainFile));
        assertEquals(
          content,
          "not in main branch",
          "content should be preserved",
        );
      }, "vt_checkout_untracked_test_");
    });
  },
});

Deno.test("file not in target branch should be deleted", async (t) => {
  await doWithNewProject(async ({ project, branch: mainBranch }) => {
    // Create a feature branch
    const featureBranch = await sdk.projects.branches
      .create(project.id, { name: "feature" });

    await t.step("add file to feature branch", async () => {
      await sdk.projects.files.create(project.id, {
        path: "feature.txt",
        content: "feature content",
        branch_id: featureBranch.id,
        type: "file",
      });
    });

    // First temp directory for feature branch checkout
    await doWithTempDir(async (featureTempDir) => {
      await t.step("checkout feature branch", async () => {
        await checkout({
          targetDir: featureTempDir,
          projectId: project.id,
          branchId: featureBranch.id,
          fromBranchId: featureBranch.id,
          version: featureBranch.version + 1,
          gitignoreRules: [],
        });

        assert(
          await exists(join(featureTempDir, "feature.txt")),
          "feature file should exist",
        );
      });

      await t.step("create local file", async () => {
        await Deno.writeTextFile(
          join(featureTempDir, "local.txt"),
          "local content",
        );
      });

      // Second temp directory for main branch checkout
      await doWithTempDir(async (mainTempDir) => {
        await t.step("checkout main branch", async () => {
          await checkout({
            targetDir: mainTempDir,
            projectId: project.id,
            branchId: mainBranch.id,
            fromBranchId: featureBranch.id,
          });
        });

        await t.step("verify file states", async () => {
          assert(
            !await exists(join(mainTempDir, "feature.txt")),
            "feature file should be deleted",
          );

          // Local file should not exist in the main branch temp dir
          // since it's a different directory
          assert(
            !await exists(join(mainTempDir, "local.txt")),
            "local file should not exist in main branch directory",
          );
        });
      }, "vt_checkout_main_branch_test_");
    }, "vt_checkout_feature_branch_test_");
  });
});

Deno.test({
  name: "test checkout with dryRun",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn(t) {
    await doWithNewProject(async ({ project, branch: mainBranch }) => {
      const testFileName = "main.txt";

      // Create a file on main branch
      await sdk.projects.files.create(project.id, {
        path: testFileName,
        content: "file on main branch",
        branch_id: mainBranch.id,
        type: "file",
      });

      await t.step("test dry run for new branch creation", async () => {
        await doWithTempDir(async (tempDir) => {
          // Try to create new branch with dryRun
          const result = await checkout({
            targetDir: tempDir,
            projectId: project.id,
            forkedFromId: mainBranch.id,
            name: "dry-run-branch",
            dryRun: true,
          });

          // Verify result properties for dry run
          assert(result.createdNew, "new branch should have been created");
          assertEquals(
            result.toBranch,
            null,
            "toBranch should be null for dryRuns", // (since no branch should actually be created)
          );
          assertEquals(result.fromBranch.id, mainBranch.id);

          // Verify fileStateChanges is populated (and we know we lack main.txt)
          assertEquals(result.fileStateChanges.created.length, 1);
          assertEquals(result.fileStateChanges.created[0].path, testFileName);

          // Verify branch wasn't actually created on server
          assertEquals(
            await branchExists(project.id, "dry-run-branch"),
            false,
            "branch should not be created during dry run",
          );

          // Checkout a second time, and expect no changes
          await checkout({
            targetDir: tempDir,
            projectId: project.id,
            branchId: mainBranch.id,
            fromBranchId: mainBranch.id,
          });

          assertEquals(result.fileStateChanges.created.length, 1);
          assertEquals(result.fileStateChanges.created[0].path, testFileName);
        }, "vt_checkout_dryrun_fork_test_");
      });

      await t.step("test dry run for file modification", async () => {
        await doWithTempDir(async (tempDir) => {
          // Checkout main branch to temp dir first (actual checkout, not dry run)
          await checkout({
            targetDir: tempDir,
            projectId: project.id,
            branchId: mainBranch.id,
            fromBranchId: mainBranch.id,
          });

          // Modify the file locally
          const localFilePath = join(tempDir, "main.txt");
          const modifiedContent = "locally modified content";
          await Deno.writeTextFile(localFilePath, modifiedContent);

          // Run checkout with dryRun
          const result = await checkout({
            targetDir: tempDir,
            projectId: project.id,
            branchId: mainBranch.id,
            fromBranchId: mainBranch.id,
            dryRun: true,
          });

          // Verify fileStateChanges contains the modified file
          assertEquals(result.fileStateChanges.modified.length, 1);
          assertEquals(result.fileStateChanges.modified[0].path, "main.txt");

          // Verify the file still has the local modification (wasn't actually changed)
          const fileContent = await Deno.readTextFile(localFilePath);
          assertEquals(
            fileContent,
            modifiedContent,
            "File should still have local modifications after dryRun",
          );
        }, "vt_checkout_dryrun_modification_test_");
      });
    });
  },
});
