import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { join } from "@std/path";
import sdk from "~/sdk.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assertStringIncludes } from "@std/assert";

Deno.test({
  name: "push command output",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        await t.step("create initial file and clone the project", async () => {
          // Create initial file
          await sdk.projects.files.create(
            project.id,
            {
              path: "initial.js",
              content: "console.log('Initial file');",
              branch_id: branch.id,
              type: "file",
            },
          );

          await runVtCommand(["clone", project.name], tmpDir);
        });

        const fullPath = join(tmpDir, project.name);

        await t.step("make a local change", async () => {
          // Create new file
          await Deno.writeTextFile(
            join(fullPath, "pushed.js"),
            "console.log('Pushed file');",
          );
        });

        await t.step("run push command", async () => {
          // Run push with dry-run first
          const [dryRunOutput] = await runVtCommand(
            ["push", "--dry-run"],
            fullPath,
          );
          assertStringIncludes(dryRunOutput, "Changes that would be pushed");
          assertStringIncludes(dryRunOutput, "pushed.js");

          // Then do the actual push
          const [pushOutput] = await runVtCommand(["push"], fullPath);
          assertStringIncludes(pushOutput, "Successfully pushed local changes");
          assertStringIncludes(pushOutput, "pushed.js");
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "push command with no changes",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        await t.step("clone the project", async () => {
          await runVtCommand(["clone", project.name], tmpDir);
        });

        const fullPath = join(tmpDir, project.name);
        await Deno.remove(join(fullPath, ".vtignore"));
        await Deno.remove(join(fullPath, "deno.json"));

        await t.step("run push command with no changes", async () => {
          const [output] = await runVtCommand(["push"], fullPath);
          assertStringIncludes(output, "No local changes to push");
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "push command stress test with 10 recursive dirs and 20 files",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        await t.step("create initial file and clone the project", async () => {
          // Create initial file
          await sdk.projects.files.create(
            project.id,
            {
              path: "initial.js",
              content: "console.log('Initial file');",
              branch_id: branch.id,
              type: "file",
            },
          );

          await runVtCommand(["clone", project.name], tmpDir);
        });

        const fullPath = join(tmpDir, project.name);

        await t.step(
          "create deep directory structure with multiple files",
          async () => {
            // Create 10 nested directories
            let currentPath = fullPath;
            for (let i = 1; i <= 5; i++) {
              const dirName = `dir${i}`;
              currentPath = join(currentPath, dirName);
              await Deno.mkdir(currentPath);

              // Add 2 files per directory (total 20 files)
              await Deno.writeTextFile(
                join(currentPath, `file${i}_1.js`),
                `console.log('File ${i}_1 content');`,
              );
              await Deno.writeTextFile(
                join(currentPath, `file${i}_2.js`),
                `console.log('File ${i}_2 content');`,
              );
            }
          },
        );

        await t.step("push all changes and verify output", async () => {
          // Run push command
          const [pushOutput] = await runVtCommand(["push"], fullPath);

          // Verify the push was successful
          assertStringIncludes(pushOutput, "Successfully pushed local changes");

          // Verify some of the expected directories and files
          assertStringIncludes(pushOutput, "dir1/");
          assertStringIncludes(pushOutput, "dir5/");
          assertStringIncludes(pushOutput, "file1_1.js");
          assertStringIncludes(pushOutput, "file5_2.js");

          // Verify the count of changes
          assertStringIncludes(pushOutput, "17 created"); // 5 dirs + (6*2=10) files + .vtignore + deno.json
        });
      });
    });
  },
});

Deno.test({
  name: "push command fails with binary file",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        await t.step("create initial file and clone the project", async () => {
          // Create initial file
          await sdk.projects.files.create(
            project.id,
            {
              path: "initial.js",
              content: "console.log('Initial file');",
              branch_id: branch.id,
              type: "file",
            },
          );

          await runVtCommand(["clone", project.name], tmpDir);
        });

        const fullPath = join(tmpDir, project.name);

        await t.step("create a binary file", async () => {
          // Create binary file with null bytes
          const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0x00, 0x03]);
          await Deno.writeFile(
            join(fullPath, "binary_file.bin"),
            binaryData,
          );
        });

        await t.step("try to push binary file and verify failure", async () => {
          // Run push command and expect failure
          const [pushOutput] = await runVtCommand(["push"], fullPath);

          // Verify the push failed due to binary file
          assertStringIncludes(pushOutput, "binary_file.bin");
          assertStringIncludes(pushOutput, "File has binary content");
          assertStringIncludes(pushOutput, "Failed to push everything");
        });
      });
    });
  },
  sanitizeResources: false,
});
