import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { createValItem, getLatestVersion, getValItem } from "~/sdk.ts";
import { clone } from "~/vt/lib/clone.ts";
import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { exists } from "@std/fs";
import type { ValFileType } from "~/types.ts";

Deno.test({
  name: "test typical cloning",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
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
            path: join("nested", "folder", "data.json"),
            content: '{"key": "value"}',
            type: "file",
          },
        ];

        await t.step("create Val files", async () => {
          // Create all files in the val
          for (const file of filesToCreate) {
            // Ensure parent directories exist in path notation
            const pathParts = file.path.split("/");
            if (pathParts.length > 1) {
              const dirPath = pathParts.slice(0, -1).join("/");
              await createValItem(
                val.id,
                {
                  path: dirPath,
                  branchId: branch.id,
                  type: "directory",
                },
              );
            }

            // Create the file
            await createValItem(
              val.id,
              {
                path: file.path,
                content: file.content,
                branchId: branch.id,
                type: file.type as ValFileType,
              },
            );
          }
        });

        await doWithTempDir(async (tempDir) => {
          await t.step("verify cloned files", async () => {
            // Clone the Val to the temp directory
            await clone({
              targetDir: tempDir,
              valId: val.id,
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
              join(tempDir, "nested", "folder"),
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
  sanitizeExit: false,
});

Deno.test({
  name: "test cloning empty directory",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      await t.step("test cloning empty directories", async (t) => {
        const emptyDirPath = join("empty", "directory");

        await t.step("create empty directory", async () => {
          // Create an empty directory to test explicit directory creation
          await createValItem(
            val.id,
            { path: emptyDirPath, branchId: branch.id, type: "directory" },
          );
        });

        await doWithTempDir(async (tempDir) => {
          await t.step("clone the val", async () => {
            // Clone the Val to the temp directory
            await clone({
              targetDir: tempDir,
              valId: val.id,
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
  sanitizeExit: false,
});

Deno.test({
  name: "test preserving updatedAt time",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const filePath = "hello.md";
        const fileContent = "# Hello World";
        let originalUpdatedAt: number;

        await t.step("create and upload hello.md", async () => {
          // Create the hello.md file in the val
          await createValItem(val.id, {
            path: filePath,
            content: fileContent,
            branchId: branch.id,
            type: "file",
          });

          // Get the updatedAt time after creation
          const fileInfo = await getValItem(
            val.id,
            branch.id,
            await getLatestVersion(val.id, branch.id),
            filePath,
          );
          originalUpdatedAt = new Date(fileInfo!.updatedAt).getTime();
        });

        await t.step("clone the val", async () => {
          // Clone the Val to the temp directory
          await clone({
            targetDir: tempDir,
            valId: val.id,
            branchId: branch.id,
            version: 7,
          });
        });

        await t.step("verify updatedAt time is the same", async () => {
          // Check the updatedAt time of the cloned file
          const clonedFilePath = join(tempDir, filePath);
          const clonedFileInfo = await Deno.stat(clonedFilePath);
          const clonedUpdatedAt = clonedFileInfo.mtime?.getTime();

          assertEquals(
            clonedUpdatedAt,
            originalUpdatedAt,
            "updatedAt time should be the same after cloning",
          );
        });
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});
