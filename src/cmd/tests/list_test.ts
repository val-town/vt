import { runVtCommand } from "~/cmd/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { assertMatch, assertStringIncludes } from "@std/assert";
import { doWithNewVal } from "~/vt/lib/tests/utils.ts";

Deno.test({
  name: "list command shows vals",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        await t.step("run list command", async () => {
          const [output] = await runVtCommand(["list"], tmpDir);

          // Verify basic output structure
          assertStringIncludes(output, "Name");
          assertStringIncludes(output, "Privacy");
          assertStringIncludes(output, "Created");
          assertStringIncludes(output, val.name);
          assertMatch(output, /Listed \d+ Vals/);
        });
      });
    });
  },
  sanitizeResources: false,
});
