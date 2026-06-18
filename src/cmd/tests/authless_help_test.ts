import { assertEquals, assertStringIncludes } from "@std/assert";
import { assertNotMatch } from "@std/assert";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";

// Force an invalid key so that, if auth were NOT skipped, the command would
// fail to authenticate and never render the help. Help appearing anyway proves
// the help-only paths bypass auth.
const noAuthEnv = { VAL_TOWN_API_KEY: "invalid-key-for-test" };

Deno.test({
  name: "vt --help works without valid auth",
  permissions: "inherit",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      const [output, code] = await runVtCommand(["--help"], tmpDir, {
        env: noAuthEnv,
      });

      assertEquals(code, 0);
      assertStringIncludes(output, "Val Town plugin");
      assertNotMatch(output, /Authentication required/i);
    });
  },
  sanitizeResources: false,
});

Deno.test({
  // A command alias (`me` -> `profile`) is a real command, not an unknown one,
  // so auth must NOT be skipped for it.
  name: "command alias still requires auth",
  permissions: "inherit",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      const [output, code] = await runVtCommand(["me"], tmpDir, {
        env: noAuthEnv,
      });

      // Auth was enforced: it fails with the invalid key rather than printing
      // the help (which a wrongly-skipped "unknown command" path would, along
      // with the plugin note).
      assertEquals(code, 1);
      assertNotMatch(output, /Val Town plugin/);
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "unknown command works without valid auth",
  permissions: "inherit",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      const [output] = await runVtCommand(["definitelyNotACommand"], tmpDir, {
        env: noAuthEnv,
      });

      assertStringIncludes(output, "Val Town plugin");
      assertNotMatch(output, /Authentication required/i);
    });
  },
  sanitizeResources: false,
});
