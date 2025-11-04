import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { join } from "@std/path";
import sdk from "~/sdk.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assertStringIncludes } from "@std/assert";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";

Deno.test({
  name: "status command with local changes",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        await t.step("create a file and clone the val", async () => {
          await sdk.vals.files.create(
            val.id,
            {
              path: "test.js",
              content: "console.log('Initial content');",
              branch_id: branch.id,
              type: "file",
            },
          );

          await runVtCommand(
            ["clone", val.name, "--no-editor-files"],
            tmpDir,
          );
        });

        const fullPath = join(tmpDir, val.name);

        await t.step("make a local change", async () => {
          // Make a local change
          await Deno.writeTextFile(
            join(fullPath, "test.js"),
            "console.log('Modified content');",
          );

          // Add a new file locally
          await Deno.writeTextFile(
            join(fullPath, "new-file.js"),
            "console.log('New file');",
          );
        });

        await t.step("run status command", async () => {
          const [output] = await runVtCommand(["status"], fullPath);

          assertStringIncludes(output, "On branch main@");

          // Verify output contains the new sections
          assertStringIncludes(output, "Changes you can push:");

          // Verify output contains information about modified and new files
          assertStringIncludes(output, "M (file  ) test.js");
          assertStringIncludes(output, "A (script) new-file.js");
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "status command with remote changes",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        await t.step("create a file and clone the val", async () => {
          await sdk.vals.files.create(
            val.id,
            {
              path: "initial.js",
              content: "console.log('Initial content');",
              branch_id: branch.id,
              type: "file",
            },
          );

          await runVtCommand(
            ["clone", val.name, "--no-editor-files"],
            tmpDir,
          );
        });

        const fullPath = join(tmpDir, val.name);

        await t.step("make a remote change", async () => {
          // Create a new file remotely
          await sdk.vals.files.create(
            val.id,
            {
              path: "remote-file.js",
              content: "console.log('Remote file');",
              branch_id: branch.id,
              type: "file",
            },
          );
        });

        await t.step("run status command", async () => {
          const [output] = await runVtCommand(["status"], fullPath);

          assertStringIncludes(output, "On branch main@0..1..2");

          // Verify output contains the new sections for remote changes
          assertStringIncludes(output, "Changes you can pull:");
        });
      });
    });
  },
  sanitizeResources: false,
});
