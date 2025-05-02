import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import sdk from "~/sdk.ts";
import { clone } from "~/vt/lib/vals/clone.ts";
import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { exists } from "@std/fs";
import type { ProjectFileType } from "~/types.ts";

Deno.test({
  name: "test typical cloning",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn(t) {
    await doWithNewProject(async ({ project, branch }) => {
      await t.step("test cloning files", async (t) => {
        const filesToCreate = [
          {
            path: "test.txt",
            content: "This is a test file",
            type: "file",
          },
          {
            path: "api.js",
            content:
              "export default function(r) { return new Response('Hi'); }",
            type: "http",
          },
          {
            path: "scheduler.js",
            content: "export default function() { console.log('hi'); }",
            type: "interval",
          },
          {
            path: "mailer.js",
            content:
              "export default function(email) { return 'Email content'; }",
            type: "email",
          },
          {
            path: "util.js",
            content: "export function helper() { return 'helper'; }",
            type: "script",
          },
          {
            path: "nested/folder/data.json",
            content: '{"key": "value"}',
            type: "file",
          },
        ];

        await t.step("create project files", async () => {
          // Create all files in the project
          for (const file of filesToCreate) {
            // Ensure parent directories exist in path notation
            const pathParts = file.path.split("/");
            if (pathParts.length > 1) {
              const dirPath = pathParts.slice(0, -1).join("/");
              await sdk.projects.files.create(
                project.id,
                {
                  path: dirPath,
                  branch_id: branch.id,
                  type: "directory",
                },
              );
            }

            // Create the file
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

        await doWithTempDir(async (tempDir) => {
          await t.step("verify cloned files", async () => {
            // Clone the project to the temp directory
            await clone({
              targetDir: tempDir,
              projectId: project.id,
              branchId: branch.id,
              version: 7,
            });

            // Verify all files were correctly cloned
            for (const file of filesToCreate) {
              const localFilePath = join(tempDir, file.path);

              // Check file exists
              const fileExists = await exists(localFilePath);
              assertEquals(
                fileExists,
                true,
                `file ${file.path} should exist after cloning`,
              );

              // Check content matches
              const content = await Deno.readTextFile(localFilePath);
              assertEquals(
                content,
                file.content,
                `content of ${file.path} should match after cloning`,
              );
            }

            // Verify directory structure was created correctly
            const nestedDirExists = await exists(
              join(tempDir, "nested/folder"),
            );
            assertEquals(
              nestedDirExists,
              true,
              "Nested directories should be created",
            );
          });
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "test cloning empty directory",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn(t) {
    await doWithNewProject(async ({ project, branch }) => {
      await t.step("test cloning empty directories", async (t) => {
        const emptyDirPath = "empty/directory";

        await t.step("create empty directory", async () => {
          // Create an empty directory to test explicit directory creation
          await sdk.projects.files.create(
            project.id,
            { path: emptyDirPath, branch_id: branch.id, type: "directory" },
          );
        });

        await doWithTempDir(async (tempDir) => {
          await t.step("clone the project", async () => {
            // Clone the project to the temp directory
            await clone({
              targetDir: tempDir,
              projectId: project.id,
              branchId: branch.id,
              version: 1,
            });
          });

          await t.step("verify empty directory was created", async () => {
            // Verify empty directory was created
            const emptyDirExists = await exists(join(tempDir, emptyDirPath));
            assertEquals(
              emptyDirExists,
              true,
              "empty directory should be created explicitly",
            );
          });
        });
      });
    });
  },
  sanitizeResources: false,
});
