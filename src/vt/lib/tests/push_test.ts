import { doWithTempDir } from "~/vt/lib/utils.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import sdk, { listProjectItems } from "~/sdk.ts";
import { push } from "~/vt/lib/push.ts";
import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import ValTown from "@valtown/sdk";

Deno.test({
  name: "test pushing",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create a file and push
        const vtFilePath = "test.txt";
        const localFilePath = join(tempDir, vtFilePath);
        await Deno.writeTextFile(localFilePath, "test");
        await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          gitignoreRules: [],
        });

        // Pull and assert that the creation workedpush test
        const originalFileContent = await sdk.projects.files
          .getContent(project.id, {
            path: vtFilePath,
            branch_id: branch.id,
            version: branch.version + 1,
          })
          .then((resp) => resp.text());
        assertEquals(
          originalFileContent,
          "test",
        );

        // Modify the file and push
        await Deno.writeTextFile(localFilePath, "test2");
        await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          gitignoreRules: [],
        });

        // Pull and assert that the modification worked
        const newFileContent = await sdk.projects.files
          .getContent(project.id, {
            path: vtFilePath,
            branch_id: branch.id,
            version: branch.version + 2,
          })
          .then((resp) => resp.text());
        assertEquals(newFileContent, "test2");

        // Delete the file and push
        await Deno.remove(localFilePath);
        await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          gitignoreRules: [],
        });

        // Assert that the file no longer exists on the remote
        await assertRejects(
          async () => {
            await sdk.projects.files.getContent(project.id, {
              path: vtFilePath,
              version: branch.version,
              branch_id: branch.id,
            });
          },
          ValTown.APIError,
          "404",
        );
      }, "vt_push_test_");
    });
  },
});

Deno.test({
  name: "test rename file",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create a folder
        const folderPath = join(tempDir, "folder");
        await Deno.mkdir(folderPath, { recursive: true });

        // Create original file
        const oldPath = join(folderPath, "old.txt");
        await Deno.writeTextFile(oldPath, "content");

        // Push original file
        await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          gitignoreRules: [],
        });

        // Rename file (delete old, create new)
        await Deno.remove(oldPath);
        const newPath = join(folderPath, "new.txt");
        await Deno.writeTextFile(newPath, "content");

        // Push renamed file
        const statusResult = await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          gitignoreRules: [],
        });

        // Check modified array
        assertEquals(
          statusResult.modified.length,
          0,
          "Should have no modified files",
        );

        // Check not_modified array
        assertEquals(statusResult.not_modified.length, 1);
        assertEquals(statusResult.not_modified[0].type, "directory");
        assertEquals(statusResult.not_modified[0].path, "folder");
        assertEquals(statusResult.not_modified[0].status, "not_modified");

        // Check deleted array
        assertEquals(statusResult.deleted.length, 1);
        assertEquals(statusResult.deleted[0].type, "file");
        assertEquals(statusResult.deleted[0].path, "folder/old.txt");
        assertEquals(statusResult.deleted[0].status, "deleted");

        // Check created array
        assertEquals(statusResult.created.length, 1);
        assertEquals(statusResult.created[0].type, "file");
        assertEquals(statusResult.created[0].path, "folder/new.txt");
        assertEquals(statusResult.created[0].status, "created");

        // Check old file is gone
        await assertRejects(
          async () => {
            const response = await sdk.projects.files.getContent(project.id, {
              path: "folder/old.txt",
              branch_id: branch.id,
              version: 4,
            });

            // Ensure the response body is consumed even if we don't expect to get here
            await response.text();
            return response;
          },
          ValTown.APIError,
          "404",
          "file should have been deleted during rename",
        );

        // Check new file exists with the right content
        const content = await sdk.projects.files
          .getContent(project.id, {
            path: "folder/new.txt",
            branch_id: branch.id,
            version: 4,
          })
          .then((resp) => resp.text());
        assertEquals(
          content,
          "content",
          "file content should match after rename",
        );
      }, "vt_rename_test_");
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "test pushing empty directory",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create an empty directory
        const emptyDirPath = join(tempDir, "empty_dir");
        await Deno.mkdir(emptyDirPath, { recursive: true });

        // Push the empty directory
        const pushResult = await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          gitignoreRules: [],
        });

        // Check that the empty directory was pushed
        assertEquals(
          pushResult.created.some((item) =>
            item.type === "directory" && item.path === "empty_dir"
          ),
          true,
          "Empty directory should be created",
        );

        // Check that the directory exists on the server
        const listResult = await listProjectItems(
          project.id,
          {
            path: "/",
            branch_id: branch.id,
            version: branch.version + 1,
          },
        );

        assertEquals(
          listResult.some((item) =>
            item.type === "directory" && item.path === "empty_dir"
          ),
          true,
          "Empty directory should exist on server",
        );
      }, "vt_push_empty_dir_test_");
    });
  },
});
