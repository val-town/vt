import { cmd } from "~/cmd/root.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { assertEquals } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import sdk from "~/sdk.ts";
import type { ProjectFileType } from "~/consts.ts";

Deno.test({
  name: "clone a newly created project",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        await t.step("create some basic files", async () => {
          // Create a few basic files to verify cloning
          const testFiles = [
            {
              path: "readme.md",
              content: "# Test Project\nThis is a test project",
              type: "file",
            },
            {
              path: "api/hello.js",
              content:
                "export default function() { return new Response('Hello World'); }",
              type: "http",
            },
          ];

          // Create directory structure first
          await sdk.projects.files.create(
            project.id,
            {
              path: "api",
              branch_id: branch.id,
              type: "directory",
            },
          );

          // Create the files
          for (const file of testFiles) {
            await sdk.projects.files.create(
              project.id,
              {
                path: file.path,
                content: file.content,
                branch_id: branch.id,
                type: file.type as ProjectFileType,
              },
            );
          }
        });

        await t.step("run the clone command", async () => {
          // Execute the clone command
          await cmd.parse(["clone", project.name, tmpDir]);
        });

        await t.step("verify cloned project structure", async () => {
          // Check that the project directory exists
          const projectDirExists = await exists(tmpDir);
          assertEquals(
            projectDirExists,
            true,
            "Project directory should exist",
          );

          // Check that the api directory was created
          const apiDirExists = await exists(join(tmpDir, "api"));
          assertEquals(apiDirExists, true, "API directory should exist");

          // Check that files were cloned with correct content
          const readmeExists = await exists(join(tmpDir, "readme.md"));
          assertEquals(readmeExists, true, "README file should exist");

          const readmeContent = await Deno.readTextFile(
            join(tmpDir, "readme.md"),
          );
          assertEquals(
            readmeContent,
            "# Test Project\nThis is a test project",
            "README content should match",
          );

          const apiFileExists = await exists(join(tmpDir, "api/hello.js"));
          assertEquals(apiFileExists, true, "API file should exist");

          const apiFileContent = await Deno.readTextFile(
            join(tmpDir, "api/hello.js"),
          );
          assertEquals(
            apiFileContent,
            "export default function() { return new Response('Hello World'); }",
            "API file content should match",
          );
        });
      });
    });
  },
});
