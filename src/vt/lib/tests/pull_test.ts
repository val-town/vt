import { doWithTempDir } from "~/vt/lib/utils.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import sdk from "~/sdk.ts";
import { pull } from "~/vt/lib/pull.ts";
import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { exists } from "@std/fs";

Deno.test({
  name: "test pulling changes",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn(t) {
    await doWithNewProject(async ({ project, branch }) => {
      await t.step("test pulling files", async (t) => {
        // Create a test file on the server
        const vtFilePath = "test.txt";
        const fileContent = "This is a test file";

        await t.step("create initial file", async () => {
          await sdk.projects.files.create(
            project.id,
            {
              path: vtFilePath,
              content: fileContent,
              branch_id: branch.id,
              type: "file",
            },
          );
        });

        await doWithTempDir(async (tempDir) => {
          await t.step("pull the project", async () => {
            // Pull the project to the temp directory
            await pull({
              targetDir: tempDir,
              projectId: project.id,
              branchId: branch.id,
            });
          });

          await t.step("verify pulled file", async () => {
            const localFilePath = join(tempDir, vtFilePath);

            // Check file exists
            const fileExists = await exists(localFilePath);
            assertEquals(
              fileExists,
              true,
              `File ${vtFilePath} should exist after pulling`,
            );

            // Check content matches
            const content = await Deno.readTextFile(localFilePath);
            assertEquals(
              content,
              fileContent,
              `Content of ${vtFilePath} should match after pulling`,
            );
          });

          await t.step("update file on server", async () => {
            const updatedContent = "This is an updated test file";

            // Update file on server
            await sdk.projects.files.update(
              project.id,
              {
                path: vtFilePath,
                content: updatedContent,
                branch_id: branch.id,
              },
            );

            // Pull updates
            await pull({
              targetDir: tempDir,
              projectId: project.id,
              branchId: branch.id,
            });

            // Verify updated content
            const localFilePath = join(tempDir, vtFilePath);
            const content = await Deno.readTextFile(localFilePath);
            assertEquals(
              content,
              updatedContent,
              "File content should be updated after pulling changes",
            );
          });

          await t.step("delete file on server", async () => {
            // Delete file on server
            await sdk.projects.files.delete(
              project.id,
              {
                path: vtFilePath,
                branch_id: branch.id,
              },
            );

            // Pull updates
            await pull({
              targetDir: tempDir,
              projectId: project.id,
              branchId: branch.id,
            });

            // Verify file was deleted locally
            const localFilePath = join(tempDir, vtFilePath);
            const fileExists = await exists(localFilePath);
            assert(
              !fileExists,
              "File should be deleted locally after pulling deletion from server",
            );
          });
        }, "vt_pull_test_");
      });
    });
  },
});

Deno.test({
  name: "test pulling with gitignore rules",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create a test file on the server
        const vtFilePath = "remote.txt";
        const ignoredFilePath = "ignored.log";

        // Create remote file
        await sdk.projects.files.create(
          project.id,
          {
            path: vtFilePath,
            content: "Remote file",
            branch_id: branch.id,
            type: "file",
          },
        );

        // Create local ignored file
        const localIgnoredPath = join(tempDir, ignoredFilePath);
        await Deno.writeTextFile(localIgnoredPath, "Ignored local file");

        // Pull with gitignore rules
        await pull({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          gitignoreRules: ["*.log"],
        });

        // Verify remote file was pulled
        const localRemotePath = join(tempDir, vtFilePath);
        const remoteFileExists = await exists(localRemotePath);
        assertEquals(
          remoteFileExists,
          true,
          "Remote file should exist after pulling",
        );

        // Verify ignored file was preserved
        const ignoredFileExists = await exists(localIgnoredPath);
        assertEquals(
          ignoredFileExists,
          true,
          "Ignored local file should be preserved after pulling",
        );

        const ignoredContent = await Deno.readTextFile(localIgnoredPath);
        assertEquals(
          ignoredContent,
          "Ignored local file",
          "Ignored file content should remain unchanged",
        );
      }, "vt_pull_gitignore_test_");
    });
  },
});

Deno.test({
  name: "test pulling with dry run",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn(t) {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create a test file on the server
        const vtFilePath = "server-file.txt";
        const fileContent = "This is a server file";

        await t.step("create file on server", async () => {
          await sdk.projects.files.create(
            project.id,
            {
              path: vtFilePath,
              content: fileContent,
              branch_id: branch.id,
              type: "file",
            },
          );
        });

        await t.step("perform dry run pull", async () => {
          // Run pull with dryRun option
          const fileStateChanges = await pull({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
            dryRun: true,
          });

          // Verify result contains expected changes
          assertEquals(
            fileStateChanges.created.length,
            1,
            "dry run should detect one file to create",
          );
          assertEquals(
            fileStateChanges.created[0].path,
            vtFilePath,
            "correct file path should be detected",
          );

          // Verify file wasn't actually created
          const localFilePath = join(tempDir, vtFilePath);
          const fileExists = await exists(localFilePath);
          assertEquals(
            fileExists,
            false,
            "file should not be created during dry run",
          );
        });

        // Now actually pull the file so we can test modifications
        await pull({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
        });

        await t.step("test dry run for modified files", async () => {
          // Update file on server
          const updatedContent = "This file has been updated on the server";
          await sdk.projects.files.update(
            project.id,
            {
              path: vtFilePath,
              content: updatedContent,
              branch_id: branch.id,
            },
          );

          // Run pull with dryRun option
          const fileStateChanges = await pull({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
            dryRun: true,
          });

          // Verify result contains expected modifications
          assertEquals(
            fileStateChanges.modified.length,
            1,
            "dry run should detect one file to modify",
          );
          assertEquals(
            fileStateChanges.modified[0].path,
            vtFilePath,
            "correct file path should be detected for modification",
          );

          // Verify file wasn't actually modified
          const localFilePath = join(tempDir, vtFilePath);
          const content = await Deno.readTextFile(localFilePath);
          assertEquals(
            content,
            fileContent,
            "file content should remain unchanged after dry run",
          );
        });
      }, "vt_pull_dryrun_test_");
    });
  },
});
