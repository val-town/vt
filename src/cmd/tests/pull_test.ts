import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { join } from "@std/path";
import { removeAllEditorFiles, runVtCommand } from "~/cmd/tests/utils.ts";
import { assertStringIncludes } from "@std/assert";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { createValItem } from "~/sdk.ts";

Deno.test({
  name: "pull command with no changes",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        await t.step("clone the val", async () => {
          await runVtCommand(["clone", val.name], tmpDir);
        });

        const fullPath = join(tmpDir, val.name);
        await removeAllEditorFiles(fullPath);

        await t.step("run pull command", async () => {
          const [output] = await runVtCommand(["pull"], fullPath);
          assertStringIncludes(output, "No changes were pulled");
        });
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});

Deno.test({
  name: "pull command with dry run option",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        await t.step("clone the val", async () => {
          await runVtCommand([
            "clone",
            val.name,
          ], tmpDir);
        });

        await t.step("make a remote change", async () => {
          await createValItem(
            val.id,
            {
              path: "remote-new.js",
              content: "console.log('Added remotely');",
              branchId: branch.id,
              type: "file",
            },
          );
        });

        await t.step("run pull command with dry run option", async () => {
          const [output] = await runVtCommand(
            ["pull", "--dry-run"],
            join(tmpDir, val.name),
          );
          assertStringIncludes(output, "that would be pulled");
        });
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});
