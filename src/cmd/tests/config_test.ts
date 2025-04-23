import { assertStringIncludes } from "@std/assert";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { assert } from "@std/assert";
import { doWithNewVal } from "~/vt/lib/tests/utils.ts";

Deno.test({
  name: "config set and get in local val",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        const localFakeApiKey = crypto.randomUUID().slice(0, 33);
        const globalFakeApiKey = crypto.randomUUID().slice(0, 33);

        await t.step("clone a new val to set the config in", async () => {
          // Clone the val
          await runVtCommand(
            ["clone", val.name],
            tmpDir,
            { env: { "XDG_CONFIG_HOME": tmpDir } },
          );
        });

        const valDir = join(tmpDir, val.name);

        await t.step("set a fake api key locally", async () => {
          const [setOutput] = await runVtCommand(
            ["config", "set", "apiKey", localFakeApiKey],
            valDir,
            { env: { "XDG_CONFIG_HOME": tmpDir } },
          );

          // Verify set output shows it's set in local configuration
          assertStringIncludes(
            setOutput,
            `Set apiKey=${localFakeApiKey} in local configuration`,
          );
        });

        await t.step("get the api key", async () => {
          // Get the API key
          const [getOutput] = await runVtCommand(
            ["config", "get", "apiKey"],
            valDir,
            { env: { "XDG_CONFIG_HOME": tmpDir } },
          );

          // Verify get output
          assertStringIncludes(getOutput, localFakeApiKey);

          // Verify .vt/config.yaml exists in the val directory
          assert(
            await exists(join(valDir, ".vt", "config.yaml")),
            "Local config file should exist",
          );
        });

        await t.step("set a fake api key globally", async () => {
          const [setOutput] = await runVtCommand(
            ["config", "set", "--global", "apiKey", globalFakeApiKey],
            valDir,
            { env: { "XDG_CONFIG_HOME": tmpDir } },
          );

          // Verify set output shows it's set in local configuration
          assertStringIncludes(
            setOutput,
            `Set apiKey=${globalFakeApiKey} in global configuration`,
          );

          assert(
            await exists(join(tmpDir, "vt", "config.yaml")),
            "Global config file should exist",
          );
        });
      });
    });
  },
});
