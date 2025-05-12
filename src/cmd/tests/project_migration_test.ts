import { runVtCommand } from "~/cmd/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { join } from "@std/path";
import { META_FOLDER_NAME, META_STATE_FILE_NAME } from "~/consts.ts";
import { assert } from "@std/assert";

Deno.test({
  name: "old and new style configs both work",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      // deno-lint-ignore no-explicit-any
      let vtState: any;

      await doWithNewVal(async ({ val }) => {
        const vtStateFilePath = join(
          tmpDir,
          val.name,
          META_FOLDER_NAME,
          META_STATE_FILE_NAME,
        );

        await t.step("clone the val and get a new schema", async () => {
          await runVtCommand([
            "clone",
            val.name,
            "--no-editor-files",
          ], tmpDir);

          vtState = JSON.parse(
            await Deno.readTextFile(vtStateFilePath),
          );

          assert(vtState.val.id, "Val ID should be present");
        });

        await t.step("check if the new schema works", async () => {
          // Change vtState.val.id to be vtState.project.id (which is the old style)
          vtState.project = { id: vtState.val.id };
          delete vtState.val;
          await Deno.writeTextFile(
            vtStateFilePath,
            JSON.stringify(vtState, null, 2),
          );

          // Run the command to check if it works with the new style config
          const [_, code] = await runVtCommand(
            ["status"],
            join(tmpDir, val.name),
          );
          assert(
            code === 0,
            "command should succeed with new style config",
          );
        });

        await t.step("check if the old schema file got updated", async () => {
          const vtStateContent = await Deno.readTextFile(vtStateFilePath);
          const vtStateParsed = JSON.parse(vtStateContent);

          assert(
            vtStateParsed.val.id === vtState.project.id,
            "Val ID should be present in the new schema",
          );

          // Check if the project field is removed
          assert(
            !vtStateParsed.project,
            "project field should be removed in the new schema",
          );
        });
      });
    });
  },
  sanitizeResources: false,
});
