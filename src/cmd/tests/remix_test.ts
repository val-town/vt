import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { join } from "@std/path";
import sdk, { user } from "~/sdk.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assert, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";
import { META_FOLDER_NAME } from "~/consts.ts";

Deno.test({
  name: "remix command from current directory",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project }) => {
        // Clone the source project to the temp dir
        await runVtCommand([
          "clone",
          `${user.username}/${project.name}`,
        ], tmpDir);

        await t.step("remix from current directory", async () => {
          const [output] = await runVtCommand(
            ["remix"],
            join(tmpDir, project.name),
          );

          // Check that the output contains the expected pattern
          assertStringIncludes(
            output,
            `Remixed current project to public project "@${user.username}/`,
          );

          // Extract the actual remixed project name from the output
          const remixPattern = new RegExp(`@${user.username}/([\\w_]+)`);
          const match = output.match(remixPattern);
          assert(
            match && match[1],
            "Could not extract remixed project name from output",
          );

          const actualRemixedProjectName = match[1];

          // Clean up the remixed project
          const { id } = await sdk.alias.username.projectName.retrieve(
            user.username!,
            actualRemixedProjectName,
          );
          await sdk.projects.delete(id);
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "remix a specific project uri",
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

Deno.test({
  name: "remix command preserves HTTP type",
  async fn(t) {
    // Create a temp dir for the source project
    await doWithTempDir(async (srcTmpDir) => {
      // Create a temp dir for the remix destination
      await doWithTempDir(async (destTmpDir) => {
        await doWithNewProject(async ({ project }) => {
          const sourceProjectName = project.name;
          const remixedProjectName = `${sourceProjectName}_http_preserved`;

          // Clone the project to the source directory
          await runVtCommand([
            "clone",
            `${user.username}/${sourceProjectName}`,
            srcTmpDir,
          ], ".");

          // Create an HTTP val in the source project
          const httpValName = "foo_http";
          const httpValPath = join(srcTmpDir, `${httpValName}.ts`);

          await Deno.writeTextFile(
            httpValPath,
            "export default function handler(req: Request) {\n" +
              '  return new Response("Hello from HTTP val!");\n' +
              "}",
          );

          // Push the changes to sync the HTTP val
          await runVtCommand(["push"], srcTmpDir, { autoConfirm: true });

          // Remix the project
          await t.step("remix project with HTTP val", async () => {
            await runVtCommand([
              "remix",
              `${user.username}/${sourceProjectName}`,
              remixedProjectName,
            ], destTmpDir);

            // Check that the HTTP val exists in the remixed project
            const remixedProjectPath = join(destTmpDir, remixedProjectName);
            const remixedHttpValPath = join(
              remixedProjectPath,
              `${httpValName}.ts`,
            );

            assert(
              await exists(remixedHttpValPath),
              "HTTP val file should exist in remixed project",
            );

            // Check the file content to ensure it's still an HTTP val
            const content = await Deno.readTextFile(remixedHttpValPath);
            assertStringIncludes(
              content,
              "export default function handler(req: Request)",
              "HTTP val signature should be preserved",
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
    });
  },
  sanitizeResources: false,
});
