import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import {
  branchExists,
  createNewBranch,
  createValItem,
  getLatestVersion,
  updateValFile,
} from "~/sdk.ts";
import { checkout } from "~/vt/lib/checkout.ts";
import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { exists } from "@std/fs";
import type ValTown from "@valtown/sdk";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";

Deno.test({
  name: "test cross branch checkout",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch: mainBranch }) => {
      let featureBranch: ValTown.Vals.BranchCreateResponse;

      await t.step("create files on main and feature branches", async () => {
        // Create a file on main branch
        await createValItem(val.id, {
          path: "main.txt",
          content: "file on main branch",
          branchId: mainBranch.id,
          type: "file",
        });

        // Create a new branch from main
        featureBranch = await createNewBranch(
          val.id,
          { branchId: mainBranch.id, name: "feature" },
        );

        // Add a file to the feature branch
        await createValItem(val.id, {
          path: "feature.txt",
          content: "file on feature branch",
          branchId: featureBranch.id,
          type: "file",
        });
      });

      await doWithTempDir(async (tempDir) => {
        // Checkout main branch
        await checkout({
          targetDir: tempDir,
          valId: val.id,
          toBranchId: mainBranch.id,
          fromBranchId: mainBranch.id,
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
          valId: val.id,
          toBranchId: featureBranch.id,
          fromBranchId: mainBranch.id,
          toBranchVersion: await getLatestVersion(
            val.id,
            featureBranch.id,
          ),
        });

        // Verify branch info
        assertEquals(result.fromBranch.id, mainBranch.id);
        assertEquals(result.toBranch!.id, featureBranch!.id);
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
      });
    });
  },
});

Deno.test({
  name: "test branch creation and checkout",
  permissions: "inherit",
  async fn() {
    await doWithNewVal(async ({ val, branch: mainBranch }) => {
      // Create a file on main branch
      await createValItem(val.id, {
        path: "main.txt",
        content: "main branch content",
        branchId: mainBranch.id,
        type: "file",
      });

      await doWithTempDir(async (tempDir) => {
        // Checkout main branch
        await checkout({
          targetDir: tempDir,
          valId: val.id,
          toBranchId: mainBranch.id,
          fromBranchId: mainBranch.id,
          toBranchVersion: 1,
        });

        // Create untracked file
        await Deno.writeTextFile(
          join(tempDir, "untracked.txt"),
          "untracked content",
        );

        // Create and checkout a new branch
        const result = await checkout({
          targetDir: tempDir,
          valId: val.id,
          forkedFromId: mainBranch.id,
          name: "new-feature",
          toBranchVersion: 2,
        });

        // Verify branch creation
        assertEquals(result.createdNew, true);
        assertEquals(result.toBranch.name, "new-feature");

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
          valId: val.id,
          toBranchId: mainBranch.id,
          fromBranchId: result.toBranch.id,
          toBranchVersion: 3,
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
      });
    });
  },
});

Deno.test({
  name: "test untracked files are carried over during checkout",
  permissions: "inherit",
  async fn() {
    await doWithNewVal(async ({ val, branch: mainBranch }) => {
      // Create a file on main branch
      await createValItem(val.id, {
        path: "main.txt",
        content: "file on main branch",
        branchId: mainBranch.id,
        type: "file",
      });

      // Create a new branch from main
      const featureBranch = await createNewBranch(
        val.id,
        { branchId: mainBranch.id, name: "feature" },
      );

      // Add a file to feature branch
      await createValItem(val.id, {
        path: "feature-only.txt",
        content: "file on feature branch only",
        branchId: featureBranch.id,
        type: "file",
      });

      await doWithTempDir(async (tempDir) => {
        // Checkout main branch
        await checkout({
          targetDir: tempDir,
          valId: val.id,
          toBranchId: mainBranch.id,
          fromBranchId: mainBranch.id,
          toBranchVersion: 1,
        });

        // Create a file that's not tracked in any branch (should be preserved)
        const untrackedFile = "untracked.txt";
        await Deno.writeTextFile(
          join(tempDir, untrackedFile),
          "untracked content",
        );

        // Create a file that exists in feature branch but not main
        // This simulates a file that exists locally but will be overwritten
        const inFeatureOnlyFile = "feature-only.txt";
        await Deno.writeTextFile(
          join(tempDir, inFeatureOnlyFile),
          "local version of feature file",
        );

        // Create a completely local file that's not in either branch
        const notInEitherBranch = "not-in-either.txt";
        await Deno.writeTextFile(
          join(tempDir, notInEitherBranch),
          "not in any branch",
        );

        // Checkout feature branch
        await checkout({
          targetDir: tempDir,
          valId: val.id,
          toBranchId: featureBranch.id,
          fromBranchId: mainBranch.id,
        });

        // Verify untracked file is preserved (not in either branch)
        assert(
          await exists(join(tempDir, untrackedFile)),
          "untracked file should be preserved",
        );

        // Verify file that exists in target branch is overwritten
        assert(
          await exists(join(tempDir, inFeatureOnlyFile)),
          "feature branch file should exist",
        );

        const featureFileContent = await Deno.readTextFile(
          join(tempDir, inFeatureOnlyFile),
        );
        assertEquals(
          featureFileContent,
          "file on feature branch only",
          "local version should be overwritten by branch version",
        );

        // Verify file not in either branch is preserved
        assert(
          await exists(join(tempDir, notInEitherBranch)),
          "file not in either branch should be preserved",
        );

        const localContent = await Deno.readTextFile(
          join(tempDir, notInEitherBranch),
        );
        assertEquals(
          localContent,
          "not in any branch",
          "content should be preserved",
        );
      });
    });
  },
});

Deno.test({
  name: "file not in target branch should be deleted",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch: mainBranch }) => {
      // Create a feature branch
      const featureBranch = await createNewBranch(
        val.id,
        { name: "feature" },
      );

      await t.step("add file to feature branch", async () => {
        await createValItem(val.id, {
          path: "feature.txt",
          content: "feature content",
          branchId: featureBranch.id,
          type: "file",
        });
      });

      // First temp directory for feature branch checkout
      await doWithTempDir(async (featureTempDir) => {
        await t.step("checkout feature branch", async () => {
          await checkout({
            targetDir: featureTempDir,
            valId: val.id,
            toBranchId: featureBranch.id,
            fromBranchId: featureBranch.id,
            toBranchVersion: 1,
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
              valId: val.id,
              toBranchId: mainBranch.id,
              fromBranchId: featureBranch.id,
              toBranchVersion: 1,
            });
          });

          await t.step("verify file states", async () => {
            assert(
              !(await exists(join(mainTempDir, "feature.txt"))),
              "feature file should be deleted",
            );

            // Local file should not exist in the main branch temp dir
            // since it's a different directory
            assert(
              !(await exists(join(mainTempDir, "local.txt"))),
              "local file should not exist in main branch directory",
            );
          });
        });
      });
    });
  },
});

Deno.test({
  name: "test checkout with dryRun",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch: mainBranch }) => {
      // Create a file on main branch
      await createValItem(val.id, {
        path: "main.txt",
        content: "file on main branch",
        branchId: mainBranch.id,
        type: "file",
      });

      await t.step("test dry run for new branch creation", async () => {
        await doWithTempDir(async (tempDir) => {
          // Try to create new branch with dryRun
          const result = await checkout({
            targetDir: tempDir,
            valId: val.id,
            forkedFromId: mainBranch.id,
            name: "dry-run-branch",
            dryRun: true,
          });

          // Verify result properties for dry run
          assert(result.createdNew, "new branch should have been created");
          assertEquals(result.fromBranch.id, mainBranch.id);
          assertEquals(
            result.fileStateChanges.not_modified.length,
            1,
            "modifications after forking to new branch",
          );
          // Verify branch wasn't actually created on server
          assertEquals(
            await branchExists(val.id, "dry-run-branch"),
            false,
            "branch should not be created during dry run",
          );

          // Checkout a second time, and expect no changes
          await checkout({
            targetDir: tempDir,
            valId: val.id,
            toBranchId: mainBranch.id,
            fromBranchId: mainBranch.id,
            toBranchVersion: await getLatestVersion(
              val.id,
              mainBranch.id,
            ),
          });

          assertEquals(result.fileStateChanges.not_modified.length, 1);
        });
      });

      await t.step("test dry run for file modification", async () => {
        await doWithTempDir(async (tempDir) => {
          // Checkout main branch to temp dir first (actual checkout, not dry
          // run)
          await checkout({
            targetDir: tempDir,
            valId: val.id,
            toBranchId: mainBranch.id,
            fromBranchId: mainBranch.id,
            toBranchVersion: 1,
          });

          // Modify the file locally
          const localFilePath = join(tempDir, "main.txt");
          const modifiedContent = "locally modified content";
          await Deno.writeTextFile(localFilePath, modifiedContent);

          // Run checkout with dryRun
          const result = await checkout({
            targetDir: tempDir,
            valId: val.id,
            toBranchId: mainBranch.id,
            fromBranchId: mainBranch.id,
            dryRun: true,
            toBranchVersion: 2,
          });

          // Verify fileStateChanges contains the modified file
          assertEquals(result.fileStateChanges.modified.length, 1);
          assertEquals(result.fileStateChanges.modified[0].path, "main.txt");

          // Verify the file still has the local modification (wasn't actually
          // changed)
          const fileContent = await Deno.readTextFile(localFilePath);
          assertEquals(
            fileContent,
            modifiedContent,
            "File should still have local modifications after dryRun",
          );
        });
      });
    });
  },
});

Deno.test({
  name: "test checkout -b preserves local unpushed changes",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch: mainBranch }) => {
      // Create a file on main branch
      await createValItem(val.id, {
        path: "original.txt",
        content: "original content",
        branchId: mainBranch.id,
        type: "file",
      });

      await doWithTempDir(async (tempDir) => {
        // Checkout main branch
        await checkout({
          targetDir: tempDir,
          valId: val.id,
          toBranchId: mainBranch.id,
          fromBranchId: mainBranch.id,
          toBranchVersion: 1,
        });

        // Verify the original file exists
        assert(
          await exists(join(tempDir, "original.txt")),
          "original file should exist after checkout",
        );

        // Create a new file locally (unpushed change)
        const newFilePath = join(tempDir, "new-file.txt");
        await Deno.writeTextFile(newFilePath, "new file content");

        // Modify the existing file locally (unpushed change)
        const originalFilePath = join(tempDir, "original.txt");
        await Deno.writeTextFile(originalFilePath, "modified content");

        // Create and checkout a new branch (equivalent to checkout -b)
        const result = await checkout({
          targetDir: tempDir,
          valId: val.id,
          forkedFromId: mainBranch.id,
          name: "feature-with-changes",
          toBranchVersion: 2,
        });

        // Verify branch creation
        assertEquals(result.createdNew, true);
        assertEquals(result.toBranch!.name, "feature-with-changes");

        // Verify the local changes still exist
        assert(
          await exists(join(tempDir, "new-file.txt")),
          "new file should still exist after branch creation",
        );

        const newFileContent = await Deno.readTextFile(newFilePath);
        assertEquals(
          newFileContent,
          "new file content",
          "new file content should be preserved",
        );

        const modifiedFileContent = await Deno.readTextFile(originalFilePath);
        assertEquals(
          modifiedFileContent,
          "modified content",
          "modified file content should be preserved",
        );

        // Verify we can push the changes to the new branch
        await t.step("push changes to new branch", async () => {
          // Push changes to the new branch (this would be a separate operation in real usage)
          await createValItem(val.id, {
            path: "new-file.txt",
            content: "new file content",
            branchId: result.toBranch!.id,
            type: "file",
          });

          await updateValFile(val.id, {
            path: "original.txt",
            content: "modified content",
            branchId: result.toBranch!.id,
          });

          // Checkout main branch again to verify changes aren't there
          await checkout({
            targetDir: tempDir,
            valId: val.id,
            toBranchId: mainBranch.id,
            fromBranchId: result.toBranch!.id,
            toBranchVersion: 3,
          });

          // Verify original content on main branch
          const mainBranchContent = await Deno.readTextFile(originalFilePath);
          assertEquals(
            mainBranchContent,
            "original content",
            "original file should have original content on main branch",
          );

          assert(
            !await exists(join(tempDir, "new-file.txt")),
            "new file should not exist on main branch",
          );
        });
      });
    });
  },
});
