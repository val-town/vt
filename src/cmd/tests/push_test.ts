import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { join } from "@std/path";
import sdk from "~/sdk.ts";
import type { ProjectFileType } from "~/consts.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assertStringIncludes } from "@std/assert";

Deno.test({
  name: "push command output",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        await t.step("create initial file and clone the project", async () => {
          // Create initial file
          await sdk.projects.files.create(
            project.id,
            {
              path: "initial.js",
              content: "console.log('Initial file');",
              branch_id: branch.id,
              type: "file" as ProjectFileType,
            },
          );

          await runVtCommand(["clone", project.name], tmpDir);
        });

        const fullPath = join(tmpDir, project.name);

        await t.step("make a local change", async () => {
          // Create new file
          await Deno.writeTextFile(
            join(fullPath, "pushed.js"),
            "console.log('Pushed file');",
          );
        });

        await t.step("run push command", async () => {
          // Run push with dry-run first
          const [dryRunOutput] = await runVtCommand(
            ["push", "--dry-run"],
            fullPath,
          );
          assertStringIncludes(dryRunOutput, "Changes that would be pushed");
          assertStringIncludes(dryRunOutput, "pushed.js");

          // Then do the actual push
          const [pushOutput] = await runVtCommand(["push"], fullPath);
          assertStringIncludes(pushOutput, "Successfully pushed local changes");
          assertStringIncludes(pushOutput, "pushed.js");
        });
      });
    });
  },
});

Deno.test({
  name: "push command with no changes",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        await t.step("clone the project", async () => {
          await runVtCommand(["clone", project.name], tmpDir);
        });

        const fullPath = join(tmpDir, project.name);

        await t.step("run push command with no changes", async () => {
          const [output] = await runVtCommand(["push"], fullPath);
          assertStringIncludes(output, "No local changes to push");
        });
      });
    });
  },
});
