import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { join } from "@std/path";
import sdk, { user } from "~/sdk.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assert, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";
import { META_FOLDER_NAME } from "~/consts.ts";

Deno.test({
  name: "remix command basic functionality",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        // Create a source project to remix
        const sourceProjectName = project.name;
        const remixedProjectName = `${sourceProjectName}_remixed`;

        await t.step("remix the project", async () => {
          const [output] = await runVtCommand([
            "remix",
            `${user.username}/${sourceProjectName}`,
            remixedProjectName,
          ], tmpDir);

          assertStringIncludes(
            output,
            `Remixed "@${user.username}/${sourceProjectName}" to public project "@${user.username}/${remixedProjectName}"`,
          );

          // Verify the remixed project directory exists
          const remixedProjectPath = join(tmpDir, remixedProjectName);
          assert(
            await exists(remixedProjectPath),
            "remixed project directory should exist",
          );

          // Verify it has the .vt metadata folder
          assert(
            await exists(join(remixedProjectPath, META_FOLDER_NAME)),
            "remixed project should have .vt metadata folder",
          );
        });

        // Clean up the remixed project
        const { id } = await sdk.alias.username.projectName.retrieve(
          user.username!,
          remixedProjectName,
        );
        await sdk.projects.delete(id);
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "remix command with privacy options",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        const sourceProjectName = project.name;

        await t.step("remix as private project", async () => {
          const privateProjectName = `${sourceProjectName}_private`;
          const [output] = await runVtCommand([
            "remix",
            `${user.username}/${sourceProjectName}`,
            privateProjectName,
            "--private",
          ], tmpDir);

          assertStringIncludes(
            output,
            `to private project`,
            "output should indicate private project",
          );

          // Clean up
          try {
            const { id } = await sdk.alias.username.projectName.retrieve(
              user.username!,
              privateProjectName,
            );
            await sdk.projects.delete(id);
          } catch (e) {
            console.error("Failed to clean up private project:", e);
          }
        });

        await t.step("remix as unlisted project", async () => {
          const unlistedProjectName = `${sourceProjectName}_unlisted`;
          const [output] = await runVtCommand([
            "remix",
            `${user.username}/${sourceProjectName}`,
            unlistedProjectName,
            "--unlisted",
          ], tmpDir);

          assertStringIncludes(
            output,
            `to unlisted project`,
            "output should indicate unlisted project",
          );

          const { id } = await sdk.alias.username.projectName.retrieve(
            user.username!,
            unlistedProjectName,
          );
          await sdk.projects.delete(id);
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "remix command with no-editor-files option",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        const sourceProjectName = project.name;
        const remixedProjectName = `${sourceProjectName}_no_editor_files`;

        await t.step("remix without editor files", async () => {
          await runVtCommand([
            "remix",
            `${user.username}/${sourceProjectName}`,
            remixedProjectName,
            "--no-editor-files",
          ], tmpDir);

          const remixedProjectPath = join(tmpDir, remixedProjectName);

          // Check that editor files don't exist
          assert(
            !(await exists(join(remixedProjectPath, ".vscode"))),
            ".vscode directory should not exist",
          );

          const { id } = await sdk.alias.username.projectName.retrieve(
            user.username!,
            remixedProjectName,
          );
          await sdk.projects.delete(id);
        });
      });
    });
  },
  sanitizeResources: false,
});
