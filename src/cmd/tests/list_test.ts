import { runVtCommand } from "~/cmd/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { assertStringIncludes } from "@std/assert";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";

Deno.test({
  name: "list command shows projects",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
    run: true,
  },
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        await t.step("run list command", async () => {
          const [output] = await runVtCommand(["list"], tmpDir);
          
          // Verify basic output structure
          assertStringIncludes(output, "Name");
          assertStringIncludes(output, "Privacy");
          assertStringIncludes(output, "Created");
          assertStringIncludes(output, project.name);
          assertStringIncludes(output, "Total:");
        });
      });
    });
  },
  sanitizeResources: false,
});