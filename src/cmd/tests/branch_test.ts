import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { join } from "@std/path";
import sdk from "~/sdk.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type ValTown from "@valtown/sdk";
import type { ProjectFileType } from "~/types.ts";

Deno.test({
  name: "branch list command shows all branches",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch: mainBranch }) => {
        let fullPath: string;

        await t.step("create additional branches", async () => {
          // Create a feature branch
          await sdk.projects.branches.create(
            project.id,
            { name: "feature", branchId: mainBranch.id },
          );

          // Create a development branch
          await sdk.projects.branches.create(
            project.id,
            { name: "development", branchId: mainBranch.id },
          );
        });

        await t.step("clone the project", async () => {
          await runVtCommand(["clone", project.name], tmpDir);
          fullPath = join(tmpDir, project.name);
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
});

Deno.test({
  name: "branch delete command removes a branch",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch: mainBranch }) => {
        let fullPath: string;
        let featureBranch: ValTown.Projects.BranchListResponse;

        await t.step("create feature branch", async () => {
          // Create a feature branch
          featureBranch = await sdk.projects.branches.create(
            project.id,
            { name: "feature-to-delete", branchId: mainBranch.id },
          );

          // Create a file on feature branch to verify it's real
          await sdk.projects.files.create(
            project.id,
            {
              path: "feature-file.js",
              content: "console.log('Feature branch file');",
              branch_id: featureBranch.id,
              type: "file" as ProjectFileType,
            },
          );
        });

        await t.step("clone the project", async () => {
          await runVtCommand(["clone", project.name], tmpDir);
          fullPath = join(tmpDir, project.name);
        });

        await t.step(
          "verify feature branch exists in branch list",
          async () => {
            const [listOutput] = await runVtCommand(["branch"], fullPath);
            assertStringIncludes(listOutput, "feature-to-delete");
          },
        );

        await t.step("delete the feature branch", async () => {
          const [deleteOutput] = await runVtCommand(
            ["branch", "-D", "feature-to-delete"],
            fullPath,
          );
          assertStringIncludes(
            deleteOutput,
            "Branch 'feature-to-delete' has been deleted",
          );
        });

        await t.step("verify branch is no longer listed", async () => {
          const [listOutput] = await runVtCommand(["branch"], fullPath);
          assert(
            !listOutput.includes("feature-to-delete"),
            "deleted branch should not appear in branch list",
          );
        });
      });
    });
  },
});

Deno.test({
  name: "branch delete command fails when trying to delete current branch",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        let fullPath: string;

        await t.step("clone the project", async () => {
          await runVtCommand(["clone", project.name], tmpDir);
          fullPath = join(tmpDir, project.name);
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
});

Deno.test({
  name: "branch command handles non-existent branch deletion",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        let fullPath: string;

        await t.step("clone the project", async () => {
          await runVtCommand(["clone", project.name], tmpDir);
          fullPath = join(tmpDir, project.name);
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
});
