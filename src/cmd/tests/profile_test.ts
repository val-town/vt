import { runVtCommand } from "~/cmd/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { assertStringIncludes } from "@std/assert";

Deno.test({
  name: "profile command shows current user information",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await t.step("run profile command", async () => {
        const [output] = await runVtCommand(["profile"], tmpDir);

        assertStringIncludes(output, "You're on the");
        assertStringIncludes(
          output,
          "Head over to https://www.val.town/pricing",
        );
        assertStringIncludes(output, "You're logged in as");
        assertStringIncludes(output, "member of"); // they are a member of an org
      });
    });
  },
  sanitizeResources: false,
});
