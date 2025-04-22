import { assertStringIncludes } from "@std/assert";
import { doWithTempDir } from "../../vt/lib/utils/doWithTempDir.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { assert } from "@std/assert";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";

Deno.test({
  name: "config set and get in local project",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        const localFakeApiKey = crypto.randomUUID().slice(0, 33);
        const globalFakeApiKey = crypto.randomUUID().slice(0, 33);

        await t.step("clone a new project to set the config in", async () => {
          // Clone the project
          await runVtCommand(
            ["clone", project.name],
            tmpDir,
            { env: { "XDG_CONFIG_HOME": tmpDir } },
          );
        });

        const projectDir = join(tmpDir, project.name);

        await t.step("set a fake api key locally", async () => {
          const [setOutput] = await runVtCommand(
            ["config", "set", "apiKey", localFakeApiKey],
            projectDir,
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
            projectDir,
            { env: { "XDG_CONFIG_HOME": tmpDir } },
          );

          // Verify get output
          assertStringIncludes(getOutput, localFakeApiKey);

          // Verify .vt/config.yaml exists in the project directory
          assert(
            await exists(join(projectDir, ".vt", "config.yaml")),
            "Local config file should exist",
          );
        });

        await t.step("set a fake api key globally", async () => {
          const [setOutput] = await runVtCommand(
            ["config", "set", "--global", "apiKey", globalFakeApiKey],
            projectDir,
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
