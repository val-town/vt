import { doWithTempDir } from "~/vt/lib/utils.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import sdk, { listProjectItems } from "~/sdk.ts";
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
        // Create and push original file
        const projectDir = join(tempDir, "project");
        await Deno.mkdir(projectDir, { recursive: true });
        await Deno.writeTextFile(
          join(projectDir, "old.txt"),
          "content",
        );

        await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
        });

        // Get the id of the original file
        const originalFile = await sdk.projects.files
          .retrieve(project.id, { path: "project/old.txt" })
          .then((resp) => resp.data[0]);

        // Rename file (delete old, create new)
        await Deno.remove(join(projectDir, "old.txt"));
        // (slightly modified, but less than 50%)
        await Deno.writeTextFile(join(projectDir, "new.txt"), "contentt");

        // Push renamed file
        const statusResult = await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
        });

        // Verify rename was detected
        assertEquals(statusResult.renamed.length, 1);
        assertEquals(statusResult.renamed[0].type, "file");
        assertEquals(statusResult.renamed[0].oldPath, "project/old.txt");
        assertEquals(statusResult.renamed[0].path, "project/new.txt");
        assertEquals(statusResult.renamed[0].status, "renamed");
        // console.log(statusResult)

        // Verify file ID is preserved (same file)
        const renamedFile = await sdk.projects.files.retrieve(
          project.id,
          { path: "project/new.txt" },
        ).then((resp) => resp.data[0]);
        assertEquals(originalFile.id, renamedFile.id);

        // Verify old file is gone
        await assertRejects(
          async () => {
            return await sdk.projects.files.retrieve(project.id, {
              path: "project/old.txt",
              branch_id: branch.id,
            });
          },
          ValTown.APIError,
          "404",
        );

        // Verify content is preserved
        const content = await sdk.projects.files
          .getContent(project.id, {
            path: "project/new.txt",
            branch_id: branch.id,
          })
          .then((resp) => resp.text());
        assertEquals(content, "contentt");
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
