import { runVtCommand } from "~/cmd/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { assert, assertStringIncludes } from "@std/assert";

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
        assert(!output.includes("member of")); // not a member of any orgs
      });
    });
  },
  sanitizeResources: false,
});
