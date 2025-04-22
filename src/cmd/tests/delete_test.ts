import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "../../vt/lib/utils/doWithTempDir.ts";
import { join } from "@std/path";
import { runVtCommand, runVtProc } from "~/cmd/tests/utils.ts";
import { assert, assertStringIncludes } from "@std/assert";
import { projectExists } from "~/sdk.ts";
import stripAnsi from "strip-ansi";
import { exists } from "@std/fs";
import { META_FOLDER_NAME } from "~/consts.ts";

Deno.test({
  name: "delete command with cancellation",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        await t.step("clone the project", async () => {
          await runVtCommand(["clone", project.name], tmpDir);
        });

        const fullPath = join(tmpDir, project.name);

        await t.step("run delete with cancellation", async () => {
          // Use runVtProc to get the process so we can send custom input
          const process = runVtProc(["delete"], fullPath);

          // Send "n" to cancel the prompt
          const stdin = process.stdin.getWriter();
          await stdin.write(new TextEncoder().encode("n\n"));
          stdin.releaseLock();
          await process.stdin.close();

          // Get and process the output
          const { stdout, stderr } = await process.output();
          const stdoutText = new TextDecoder().decode(stdout);
          const stderrText = new TextDecoder().decode(stderr);
          const output = stripAnsi(stdoutText + stderrText);

          assertStringIncludes(output, "Deletion cancelled");

          // Verify the project still exists
          assert(
            await projectExists(project.id),
            "project should still exist",
          );
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "delete command with force option",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        await t.step("clone the project", async () => {
          await runVtCommand(["clone", project.name], tmpDir);
        });

        const fullPath = join(tmpDir, project.name);

        await t.step("run delete with force option", async () => {
          const [output] = await runVtCommand(["delete", "--force"], fullPath);
          assertStringIncludes(
            output,
            `Project "${project.name}" has been deleted`,
          );

          // Verify the project no longer exists
          assert(
            !await projectExists(project.id),
            "project should no longer exist",
          );
        });

        await t.step("directory should be de-inited", async () => {
          assert(
            !await exists(join(fullPath, META_FOLDER_NAME)),
            "directory should be de-inited",
          );
        });
      });
    });
  },
  sanitizeResources: false,
});
