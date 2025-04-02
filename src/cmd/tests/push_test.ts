import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { join } from "@std/path";
import sdk from "~/sdk.ts";
import type { ProjectFileType } from "~/consts.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assert, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";

Deno.test({
  name: "push command output",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
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

        // Clone the project
        await runVtCommand(["clone", project.name], tmpDir);

        // Ensure the directory exists
        assert(
          await exists(join(tmpDir, project.name)),
          "project directory does not exist",
        );
        const fullPath = join(tmpDir, project.name);

        // Create new file
        await Deno.writeTextFile(
          join(fullPath, "pushed.js"),
          "console.log('Pushed file');",
        );

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
  },
});

Deno.test({
  name: "push command with no changes",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        // Clone the empty project
        await runVtCommand(["clone", project.name], tmpDir);

        // Ensure the directory exists
        assert(
          await exists(join(tmpDir, project.name)),
          "project directory does not exist",
        );
        const fullPath = join(tmpDir, project.name);

        // Run push without any changes
        const [output] = await runVtCommand(["push"], fullPath);
        assertStringIncludes(output, "No local changes to push");
      });
    });
  },
});
