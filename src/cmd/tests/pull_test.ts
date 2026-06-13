import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { join } from "@std/path";
import sdk from "~/sdk.ts";
import {
  removeAllEditorFiles,
  runVtCommand,
  streamVtCommand,
} from "~/cmd/tests/utils.ts";
import { assert, assertStringIncludes } from "@std/assert";
import { AssertionError } from "@std/assert";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { delay } from "@std/async";

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
          await sdk.vals.files.create(
            val.id,
            {
              path: "remote-new.js",
              content: "console.log('Added remotely');",
              branch_id: branch.id,
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
});

Deno.test({
  name: "pull exits non-zero with a --force hint when stdin is not interactive",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        await t.step("clone the val", async () => {
          await runVtCommand(["clone", val.name], tmpDir);
        });

        const fullPath = join(tmpDir, val.name);

        await t.step("create a tracked file", async () => {
          await sdk.vals.files.create(val.id, {
            path: "note.ts",
            content: "export const x = 1;\n",
            branch_id: branch.id,
            type: "file",
          });
          await runVtCommand(["pull"], fullPath);
        });

        await t.step("diverge local and remote", async () => {
          // Edit the file remotely...
          await sdk.vals.files.update(val.id, {
            path: "note.ts",
            content: "export const x = 999;\n",
            branch_id: branch.id,
          });
          // ...and locally, so a pull would overwrite local changes.
          await Deno.writeTextFile(
            join(fullPath, "note.ts"),
            "export const x = 2;\n",
          );
        });

        await t.step("pull with non-interactive stdin fails fast", async () => {
          // streamVtCommand spawns with piped (non-TTY) stdin and never writes
          // to it. Before the fix, the confirmation prompt would busy-loop
          // forever instead of exiting.
          const [output, proc] = streamVtCommand(["pull"], fullPath);

          const status = await Promise.race([
            proc.status,
            delay(15_000).then(() => "timeout" as const),
          ]);

          if (status === "timeout") {
            try {
              proc.kill();
            } catch { /* already exited */ }
            throw new AssertionError(
              "vt pull hung instead of failing fast on non-interactive stdin",
            );
          }

          assert(!status.success, "expected pull to exit non-zero");
          assertStringIncludes(output.join("\n"), "Re-run with --force");
        });
      });
    });
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
