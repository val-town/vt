import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { join } from "@std/path";
import sdk from "~/sdk.ts";
import type { ProjectFileType } from "~/consts.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assert, assertStringIncludes } from "@std/assert";
import { ensureDir, exists } from "@std/fs";

Deno.test({
  name: "pull command with no changes",
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

        // Run pull without any remote changes
        const [output] = await runVtCommand(["pull"], fullPath);
        assertStringIncludes(output, "No changes were pulled");
      });
    });
  },
});

Deno.test({
  name: "pull command with dry run option",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        // Clone the project
        const [cloneOutput] = await runVtCommand([
          "clone",
          project.name,
        ], tmpDir);

        // Get the actual directory name from the clone output
        const match = cloneOutput.match(/Cloned to (.+)/);
        const projectDir = match ? match[1].trim() : project.name;

        // Ensure the directory exists
        const fullPath = join(tmpDir, projectDir);
        const dirExists = await exists(fullPath);
        if (!dirExists) {
          await ensureDir(fullPath);
        }

        // Add a remote change
        await sdk.projects.files.create(
          project.id,
          {
            path: "remote-new.js",
            content: "console.log('Added remotely');",
            branch_id: branch.id,
            type: "file" as ProjectFileType,
          },
        );

        const [output] = await runVtCommand(["pull", "--dry-run"], fullPath);
        assertStringIncludes(output, "that would be pulled");
      });
    });
  },
});
