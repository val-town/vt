import { doWithTempDir } from "~/vt/lib/utils.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import sdk from "~/sdk.ts";
import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { status } from "~/vt/lib/status.ts";
import type { ItemStatusManager } from "~/vt/lib/ItemStatusManager.ts";

Deno.test({
  name: "test typical file status reporting",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn(t) {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const remoteFile1 = "remote.txt";
        const remoteFile2 = "remote2.txt";
        const localOnlyFile = "local.txt";

        await t.step("create a local and remote layout", async () => {
          await sdk.projects.files.create(project.id, {
            path: remoteFile1,
            content: "Remote file 1",
            branch_id: branch.id,
            type: "file",
          });

          await sdk.projects.files.create(project.id, {
            path: remoteFile2,
            content: "Remote file 2",
            branch_id: branch.id,
            type: "file",
          });

          // Create the same files locally but with modifications
          await Deno.writeTextFile(
            join(tempDir, remoteFile1),
            "remote file 1 - modified locally",
          );

          // Create a new local file that doesn't exist remotely
          await Deno.writeTextFile(
            join(tempDir, localOnlyFile),
            "local only file",
          );
        });

        await t.step("varify status layout", async () => {
          // Run status check
          const result: ItemStatusManager = await status({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
          });

          // Test file that exists in both places but was modified locally
          assertEquals(result.modified.length, 1);
          assertEquals(result.modified[0].path, remoteFile1);

          // Test local-only file (should be created)
          assertEquals(result.created.length, 1);
          assertEquals(result.created[0].path, localOnlyFile);

          // Test file missing locally (should be deleted)
          assertEquals(result.deleted.length, 1);
          assertEquals(result.deleted[0].path, remoteFile2);
        });
      });
    });
  },
});

Deno.test({
  name: "test status detects empty directory",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        await Deno.mkdir(join(tempDir, "empty_dir"));

        const statusResult = await status({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          version: branch.version,
          gitignoreRules: [
            ".vtignore",
            ".vt",
            "deno.json",
            ".vtignore",
            ".vt",
            ".env",
          ],
        });

        // Verify the empty directory is detected as a new item to be created
        const createdDir = statusResult.created.find(
          (item) => item.type === "directory" && item.path === "empty_dir",
        );
        assertEquals(
          !!createdDir,
          true,
          "empty directory should be detected as created",
        );
      });
    });
  },
});

Deno.test({
  name: "test status detects renamed files",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn(t) {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        await t.step("create a local and remote layout", async () => {
          // Create a folder
          const folderPath = join(tempDir, "folder");
          await Deno.mkdir(folderPath, { recursive: true });

          // Create original file
          const oldPath = join(folderPath, "old.txt");
          await Deno.writeTextFile(oldPath, "content");

          // Push original file to remote
          await sdk.projects.files.create(project.id, {
            path: "folder/old.txt",
            content: "content",
            branch_id: branch.id,
            type: "file",
          });

          // Rename file (delete old, create new)
          await Deno.remove(oldPath);
          const newPath = join(folderPath, "renamed.txt");
          await Deno.writeTextFile(newPath, "content");

          // Create a totally new file
          await Deno.writeTextFile(join(tempDir, "new.txt"), "content");
        });

        await t.step("run a status check on the current state", async () => {
          // Run status check
          const statusResult = await status({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
          });

          // Check not_modified array
          assertEquals(statusResult.not_modified.length, 1);
          assertEquals(statusResult.not_modified[0].type, "directory");
          assertEquals(statusResult.not_modified[0].path, "folder");
          assertEquals(statusResult.not_modified[0].status, "not_modified");

          // Check renamed array
          assertEquals(statusResult.renamed.length, 1);
          assertEquals(statusResult.renamed[0].type, "file");
          assertEquals(statusResult.renamed[0].path, "folder/renamed.txt");
          assertEquals(statusResult.renamed[0].oldPath, "folder/old.txt");
          assertEquals(statusResult.renamed[0].status, "renamed");

          // Check created array - should only have the new.txt file
          assertEquals(statusResult.created.length, 1);
          assertEquals(statusResult.created[0].type, "file");
          assertEquals(statusResult.created[0].path, "new.txt");
          assertEquals(statusResult.created[0].status, "created");

          // Check deleted array - should be empty since the file was renamed, not deleted
          assertEquals(statusResult.deleted.length, 0);
        });
      });
    });
  },
});
