import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { join } from "@std/path";
import sdk from "~/sdk.ts";
import type { ProjectFileType } from "~/consts.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assert, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";

Deno.test({
  name: "status command with local changes",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        await sdk.projects.files.create(
          project.id,
          {
            path: "test.js",
            content: "console.log('Initial content');",
            branch_id: branch.id,
            type: "file" as ProjectFileType,
          },
        );

        await runVtCommand(["clone", project.name], tmpDir);

        assert(
          await exists(join(tmpDir, project.name)),
          "project directory does not exist",
        );
        const fullPath = join(tmpDir, project.name);

        // Make a local change
        await Deno.writeTextFile(
          join(fullPath, "test.js"),
          "console.log('Modified content');",
        );

        // Add a new file locally
        await Deno.writeTextFile(
          join(fullPath, "new-file.js"),
          "console.log('New file');",
        );

        const [output] = await runVtCommand(["status"], fullPath);

        assertStringIncludes(output, "On branch main@");

        // Verify output contains information about modified and new files
        assertStringIncludes(output, "M (file  ) test.js");
        assertStringIncludes(output, "A (script) new-file.js");

        // Check for summary counts
        assertStringIncludes(output, "1 created");
        assertStringIncludes(output, "1 modified");
      });
    });
  },
});

Deno.test({
  name: "status command with remote changes",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        await sdk.projects.files.create(
          project.id,
          {
            path: "initial.js",
            content: "console.log('Initial content');",
            branch_id: branch.id,
            type: "file" as ProjectFileType,
          },
        );

        await runVtCommand(["clone", project.name], tmpDir);

        assert(
          await exists(join(tmpDir, project.name)),
          "project directory does not exist",
        );
        const fullPath = join(tmpDir, project.name);

        // Create a new file remotely
        await sdk.projects.files.create(
          project.id,
          {
            path: "remote-file.js",
            content: "console.log('Remote file');",
            branch_id: branch.id,
            type: "file" as ProjectFileType,
          },
        );

        const [output] = await runVtCommand(["status"], fullPath);

        assertStringIncludes(output, "On branch main@1..2");
      });
    });
  },
});
