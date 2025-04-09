import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { join } from "@std/path";
import sdk from "~/sdk.ts";
import type { ProjectFileType } from "~/consts.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assertStringIncludes } from "@std/assert";

Deno.test({
  name: "pull command with no changes",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        await t.step("clone the project", async () => {
          await runVtCommand(["clone", project.name], tmpDir);
        });

        const fullPath = join(tmpDir, project.name);
        await Deno.remove(join(fullPath, ".vtignore"));
        await Deno.remove(join(fullPath, "deno.json"));

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
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        await t.step("clone the project", async () => {
          await runVtCommand([
            "clone",
            project.name,
          ], tmpDir);
        });

        await t.step("make a remote change", async () => {
          await sdk.projects.files.create(
            project.id,
            {
              path: "remote-new.js",
              content: "console.log('Added remotely');",
              branch_id: branch.id,
              type: "file" as ProjectFileType,
            },
          );
        });

        await t.step("run pull command with dry run option", async () => {
          const [output] = await runVtCommand(
            ["pull", "--dry-run"],
            join(tmpDir, project.name),
          );
          assertStringIncludes(output, "that would be pulled");
        });
      });
    });
  },
  sanitizeResources: false,
});
