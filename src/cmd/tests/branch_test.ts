import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { join } from "@std/path";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type ValTown from "@valtown/sdk";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { createNewBranch, createValItem, deleteBranch } from "~/sdk.ts";

Deno.test({
  name: "branch list command shows all branches",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch: mainBranch }) => {
        const fullPath = join(tmpDir, val.name);

        await t.step("create additional branches", async () => {
          await createNewBranch(
            val.id,
            { name: "feature", branchId: mainBranch.id },
          );

          await createNewBranch(
            val.id,
            { name: "development", branchId: mainBranch.id },
          );
        });

        await t.step("clone the val", async () => {
          await runVtCommand(["clone", val.name, "--no-editor-files"], tmpDir);
        });

        await t.step("list branches and verify output", async () => {
          const [output] = await runVtCommand(["branch"], fullPath);

          // Check that all three branches are listed
          assertStringIncludes(output, "* main"); // Current branch with asterisk
          assertStringIncludes(output, "feature");
          assertStringIncludes(output, "development");

          // Check that the table headers are present
          assertStringIncludes(output, "Name");
          assertStringIncludes(output, "Version");
          assertStringIncludes(output, "Created On");
          assertStringIncludes(output, "Updated On");
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "branch delete command removes a branch",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch: mainBranch }) => {
        let fullPath: string;
        let featureBranch: ValTown.Vals.BranchListResponse;

        await t.step("create feature branch", async () => {
          featureBranch = await createNewBranch(
            val.id,
            { name: "feature", branchId: mainBranch.id },
          );

          await createValItem(
            val.id,
            {
              path: "feature.txt",
              branchId: featureBranch.id,
              content: "feature branch file",
              type: "file",
            },
          );
        });

        await t.step("clone the val", async () => {
          await runVtCommand(["clone", val.name, "--no-editor-files"], tmpDir);
          fullPath = join(tmpDir, val.name);
        });

        await t.step(
          "verify feature branch exists in branch list",
          async () => {
            const [listOutput] = await runVtCommand(["branch"], fullPath);
            assertStringIncludes(listOutput, "feature");
          },
        );

        await t.step("delete the feature branch", async () => {
          const [deleteOutput] = await runVtCommand(
            ["branch", "-D", "feature"],
            fullPath,
          );
          assertStringIncludes(
            deleteOutput,
            "Branch 'feature' has been deleted",
          );
        });

        await t.step("verify branch is no longer listed", async () => {
          const [listOutput] = await runVtCommand(["branch"], fullPath);
          assert(
            !listOutput.includes("feature"),
            "deleted branch should not appear in branch list",
          );
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "branch delete command fails when trying to delete current branch",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        let fullPath: string;

        await t.step("clone the val", async () => {
          await runVtCommand(["clone", val.name, "--no-editor-files"], tmpDir);
          fullPath = join(tmpDir, val.name);
        });

        await t.step("try to delete the current branch", async () => {
          const [_, status] = await runVtCommand(
            ["branch", "-D", "main"],
            fullPath,
          );
          assertEquals(status, 1, "Should have failed with status 1");
        });

        await t.step("verify current branch still exists", async () => {
          const [listOutput] = await runVtCommand(["branch"], fullPath);
          assertStringIncludes(listOutput, "* main");
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "branch command handles non-existent branch deletion",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        let fullPath: string;

        await t.step("clone the val", async () => {
          await runVtCommand(["clone", val.name, "--no-editor-files"], tmpDir);
          fullPath = join(tmpDir, val.name);
        });

        await t.step("try to delete a non-existent branch", async () => {
          const [_, status] = await runVtCommand(
            ["branch", "-D", "non-existent-branch"],
            fullPath,
          );
          assertEquals(status, 1, "Should have thrown an error");
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "branch command shows warning tip when current branch no longer exists",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch: mainBranch }) => {
        const fullPath = join(tmpDir, val.name);
        let tempBranch: ValTown.Vals.BranchListResponse;

        await t.step("create temporary branch", async () => {
          tempBranch = await createNewBranch(
            val.id,
            { name: "temp", branchId: mainBranch.id },
          );

          await createValItem(
            val.id,
            {
              path: "temp.txt",
              branchId: tempBranch.id,
              content: "temp branch file",
              type: "file",
            },
          );
        });

        await t.step("clone and checkout to temporary branch", async () => {
          await runVtCommand(["clone", val.name, "--no-editor-files"], tmpDir);
          await runVtCommand(["checkout", "temp"], fullPath);
        });

        await t.step("delete the branch remotely", async () => {
          await deleteBranch(val.id, tempBranch.id);
        });

        await t.step("run branch command and verify warning", async () => {
          const [output] = await runVtCommand(["branch"], fullPath);

          // Check that the branch list shows available branches
          assertStringIncludes(output, "main");

          // Check that it shows the warning about current branch
          assertStringIncludes(
            output,
            "Note that the current branch no longer exists. You will have to check out to a branch that exists.",
            "Should warn that current branch no longer exists",
          );
        });
      });
    });
  },
  sanitizeResources: false,
});
