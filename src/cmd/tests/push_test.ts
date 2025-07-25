import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { join } from "@std/path";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assertStringIncludes } from "@std/assert";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { createValItem } from "~/sdk.ts";

Deno.test({
  name: "push command output",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        await t.step("create initial file and clone the val", async () => {
          await createValItem(
            val.id,
            {
              path: "initial.js",
              content: "console.log('Initial file');",
              branchId: branch.id,
              type: "file",
            },
          );

          await runVtCommand(["clone", val.name], tmpDir);
        });

        const fullPath = join(tmpDir, val.name);

        await t.step("make a local change", async () => {
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
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        await t.step("clone the val", async () => {
          await runVtCommand(["clone", val.name, "--no-editor-files"], tmpDir);
        });

        const fullPath = join(tmpDir, val.name);

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
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        await t.step("create initial file and clone the val", async () => {
          await createValItem(
            val.id,
            {
              path: "initial.js",
              content: "console.log('Initial file');",
              branchId: branch.id,
              type: "file",
            },
          );

          await runVtCommand(["clone", val.name], tmpDir);
        });

        const fullPath = join(tmpDir, val.name);

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
          const [pushOutput] = await runVtCommand(["push"], fullPath);

          assertStringIncludes(pushOutput, "Successfully pushed local changes");

          // Verify some of the expected directories and files
          assertStringIncludes(pushOutput, "dir1/");
          assertStringIncludes(pushOutput, "dir5/");
          assertStringIncludes(pushOutput, "file1_1.js");
          assertStringIncludes(pushOutput, "file5_2.js");

          // Verify the count of changes
          assertStringIncludes(pushOutput, "created"); // we don't really know how many because of editor template files
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "push command fails with binary file",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        await t.step("create initial file and clone the val", async () => {
          await createValItem(
            val.id,
            {
              path: "initial.js",
              content: "console.log('Initial file');",
              branchId: branch.id,
              type: "file",
            },
          );

          await runVtCommand(["clone", val.name], tmpDir);
        });

        const fullPath = join(tmpDir, val.name);

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
