import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { join } from "@std/path";
import sdk from "~/sdk.ts";
import type { ProjectFileType } from "~/consts.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assert, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";
import { deadline } from "@std/async";

Deno.test({
  name: "checkout -b preserves local unpushed changes",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch: mainBranch }) => {
        let fullPath: string;
        let originalFilePath: string;
        let newFilePath: string;

        await t.step("create file on main branch", async () => {
          await sdk.projects.files.create(
            project.id,
            {
              path: "original.txt",
              content: "original content",
              branch_id: mainBranch.id,
              type: "file" as ProjectFileType,
            },
          );
        });

        await t.step("clone project and make local changes", async () => {
          await runVtCommand(["clone", project.name], tmpDir);
          fullPath = join(tmpDir, project.name);
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
});

Deno.test({
  name: "check out to existing branch",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        // Create initial file on main branch
        await sdk.projects.files.create(
          project.id,
          {
            path: "main-file.js",
            content: "console.log('Main branch file');",
            branch_id: branch.id,
            type: "file" as ProjectFileType,
          },
        );

        // Create a new branch using SDK
        const newBranch = await sdk.projects.branches.create(
          project.id,
          { name: "feature-branch", branchId: branch.id },
        );

        // Create a file on the new branch
        await sdk.projects.files.create(
          project.id,
          {
            path: "feature-file.js",
            content: "console.log('Feature branch file');",
            branch_id: newBranch.id,
            type: "file" as ProjectFileType,
          },
        );

        // Clone the project (defaults to main branch)
        await runVtCommand(["clone", project.name], tmpDir);
        const fullPath = join(tmpDir, project.name);

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
});

Deno.test({
  name: "create new branch with -b",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        // Create initial file on main branch
        await sdk.projects.files.create(
          project.id,
          {
            path: "main-file.js",
            content: "console.log('Main branch file');",
            branch_id: branch.id,
            type: "file" as ProjectFileType,
          },
        );

        // Clone the project
        await runVtCommand(["clone", project.name], tmpDir);
        const fullPath = join(tmpDir, project.name);

        // Create a new branch with checkout -b
        const [checkoutOutput] = await runVtCommand([
          "checkout",
          "-b",
          "new-branch",
        ], fullPath);
        assertStringIncludes(
          checkoutOutput,
          'Created and switched to new branch "new-branch"',
        );

        // The main file should still exist (since we forked from main)
        assert(
          await exists(join(fullPath, "main-file.js")),
          "main-file.js should exist on new branch",
        );

        // Check status on new branch
        const [statusOutput] = await runVtCommand(["status"], fullPath);
        assertStringIncludes(statusOutput, "On branch new-branch@");

        // Create a file on the new branch
        await Deno.writeTextFile(
          join(fullPath, "new-branch-file.js"),
          "console.log('New branch file');",
        );

        // Push the changes to establish the new branch remotely
        await runVtCommand(["push"], fullPath);

        // Switch back to main branch
        await runVtCommand(["checkout", "main"], fullPath);

        // The new branch file should no longer be present
        assert(
          !(await exists(join(fullPath, "new-branch-file.js"))),
          "new-branch-file.js should not exist on main branch",
        );

        // Status should show we're on main branch
        const [mainStatusOutput] = await runVtCommand(["status"], fullPath);
        assertStringIncludes(mainStatusOutput, "On branch main@");
      });
    });
  },
});

Deno.test({
  name: "warning on modified files",
  async fn(t) {
    // Put an 8s deadline, since in the past we had an issue with this stalling
    // due to waiting for a user interaction
    await deadline(
      (async () => {
        return await doWithTempDir(async (tmpDir) => {
          await doWithNewProject(async ({ project, branch }) => {
            let fullPath: string;

            await t.step("create initial file on main branch", async () => {
              await sdk.projects.files.create(
                project.id,
                {
                  path: "shared-file.js",
                  content: "console.log('Original content');",
                  branch_id: branch.id,
                  type: "file" as ProjectFileType,
                },
              );
            });

            await t.step(
              "create and modify file on feature branch",
              async () => {
                // Create a feature branch
                const featureBranch = await sdk.projects.branches.create(
                  project.id,
                  { name: "feature", branchId: branch.id },
                );

                // Modify the file on feature branch
                await sdk.projects.files.update(
                  project.id,
                  {
                    branch_id: featureBranch.id,
                    path: "shared-file.js",
                    content: "console.log('Feature branch content');",
                  },
                );
              },
            );

            await t.step("clone project and modify file locally", async () => {
              // Clone the project (defaults to main branch)
              await runVtCommand(["clone", project.name], tmpDir);
              fullPath = join(tmpDir, project.name);

              // Modify the shared file locally while on main branch
              await Deno.writeTextFile(
                join(fullPath, "shared-file.js"),
                "console.log('Modified locally on main');",
              );
            });

            await t.step(
              "checkout with warning about local changes",
              async () => {
                // Try checking out to feature branch - should see warning about local changes
                const [checkoutOutput] = await runVtCommand(
                  ["checkout", "feature"],
                  fullPath,
                );

                // Should see warning about dangerous changes
                assertStringIncludes(
                  checkoutOutput,
                  "proceed with checkout anyway",
                );
                assertStringIncludes(checkoutOutput, "Changed:"); // runVtCommand spams yes
                assertStringIncludes(checkoutOutput, "shared-file.js");
              },
            );

            await t.step("force checkout overrides local changes", async () => {
              // Try with force option
              const [forceCheckoutOutput] = await runVtCommand([
                "checkout",
                "feature",
                "-f",
              ], fullPath);
              assertStringIncludes(
                forceCheckoutOutput,
                'Switched to branch "feature"',
              );

              // The content should now be the feature branch content
              const fileContent = await Deno.readTextFile(
                join(fullPath, "shared-file.js"),
              );
              assert(
                fileContent === "console.log('Feature branch content');",
                "File content should match feature branch version after force checkout",
              );
            });
          });
        });
      })(),
      1000 * 8,
    );
  },
});
