import { doWithTempDir } from "~/vt/lib/utils.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import sdk, { getLatestVersion, listProjectItems } from "~/sdk.ts";
import { push } from "~/vt/lib/push.ts";
import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import ValTown from "@valtown/sdk";

Deno.test({
  name: "test typical pushing",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn(t) {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const vtFilePath = "test.txt";
        const localFilePath = join(tempDir, vtFilePath);

        await t.step("create a file and push it", async () => {
          await Deno.writeTextFile(localFilePath, "test");
          await push({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
          });

          // Pull and assert that the creation worked
          const originalFileContent = await sdk.projects.files
            .getContent(project.id, {
              path: vtFilePath,
              branch_id: branch.id,
            })
            .then((resp) => resp.text());
          assertEquals(
            originalFileContent,
            "test",
          );
        });

        await t.step("modify the file and push changes", async () => {
          await Deno.writeTextFile(localFilePath, "test2");
          await push({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
          });

          // Pull and assert that the modification worked
          const newFileContent = await sdk.projects.files
            .getContent(project.id, {
              path: vtFilePath,
              branch_id: branch.id,
            })
            .then((resp) => resp.text());
          assertEquals(newFileContent, "test2");
        });

        await t.step("delete the file and push deletion", async () => {
          await Deno.remove(localFilePath);
          await push({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
          });

          // Assert that the file no longer exists on the remote
          await assertRejects(
            async () => {
              await sdk.projects.files.getContent(project.id, {
                path: vtFilePath,
                branch_id: branch.id,
              });
            },
            ValTown.APIError,
            "404",
          );
        });
      });
    });
  },
});

Deno.test({
  name: "test renaming file",
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
        });

        // Check modified array
        assertEquals(statusResult.modified.length, 0);

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
          })
          .then((resp) => resp.text());
        assertEquals(
          content,
          "content",
          "file content should match after rename",
        );
      });
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
            path: "",
            branch_id: branch.id,
            recursive: true,
            version: await getLatestVersion(project.id, branch.id),
          },
        );

        assertEquals(
          listResult.some((item) =>
            item.type === "directory" && item.path === "empty_dir"
          ),
          true,
          "Empty directory should exist on server",
        );
      });
    });
  },
});

Deno.test({
  name: "test dry run push",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create a file
        const vtFilePath = "test.txt";
        const localFilePath = join(tempDir, vtFilePath);
        await Deno.writeTextFile(localFilePath, "test content");

        // Push with dryRun enabled
        const result = await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          dryRun: true,
        });

        // Verify that FileState reports correct changes
        assertEquals(result.created.length, 1);
        assertEquals(result.created[0].path, vtFilePath);
        assertEquals(result.created[0].status, "created");
        assertEquals(result.created[0].type, "file");

        // Assert that the file was NOT actually pushed to the server
        await assertRejects(
          async () => {
            await sdk.projects.files.getContent(project.id, {
              path: vtFilePath,
              branch_id: branch.id,
            });
          },
          ValTown.APIError,
          "404",
          "File should not exist on server after dry run",
        );
      });
    });
  },
});

Deno.test({
  name: "test push with no changes",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create a file
        const vtFilePath = "test.txt";
        const localFilePath = join(tempDir, vtFilePath);
        await Deno.writeTextFile(localFilePath, "test content");

        // Do the push
        const firstResult = await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
        });

        // Verify that FileState reports the file was created. We have better
        // tests for ensuring this operation with more detail, this is just to
        // make sure it's idempotent.
        assertEquals(firstResult.created.length, 1);
        assertEquals(firstResult.size(), 1);

        const secondResult = await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
        });
        // Should be no changes on the second push
        assertEquals(secondResult.not_modified.length, 1);
        assertEquals(secondResult.size(), 1);
      });
    });
  },
});
