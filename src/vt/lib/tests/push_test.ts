import { doWithTempDir } from "~/vt/lib/utils.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import sdk, {
  getLatestVersion,
  listProjectItems,
  projectItemExists,
} from "~/sdk.ts";
import { push } from "~/vt/lib/push.ts";
import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";

Deno.test({
  name: "test moving file from subdirectory to root",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn(t) {
    await doWithTempDir(async (tempDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        // Make sure tempDir exists and is accessible
        await Deno.mkdir(tempDir, { recursive: true });

        const subDir = join(tempDir, "subdir");
        const initialFilePath = join(subDir, "test.txt");

        await t.step("create file in directory", async () => {
          // Create a file in a subdirectory
          await Deno.mkdir(subDir, { recursive: true });
          await Deno.writeTextFile(initialFilePath, "test content");

          // Push the file in subdirectory
          const { itemStateChanges: firstPush } = await push({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
          });
          assertEquals(firstPush.created.length, 2); // dir and file
        });

        await t.step("move the file to root", async () => {
          // Move file to root
          const rootFilePath = join(tempDir, "test.txt");
          await Deno.remove(initialFilePath);
          await Deno.writeTextFile(rootFilePath, "test content");

          // Push the moved file
          const { itemStateChanges: secondPush } = await push({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
          });
          assertEquals(secondPush.renamed.length, 1);
          assertEquals(secondPush.renamed[0].oldPath, "subdir/test.txt");
          assertEquals(secondPush.renamed[0].path, "test.txt");
        });

        await t.step("verify file exists at new location", async () => {
          // Push again with no changes
          const { itemStateChanges: thirdPush } = await push({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
          });

          // Final push should have no changes
          assertEquals(thirdPush.not_modified.length, 2);
          assertEquals(thirdPush.size(), 2);
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "test ambiguous rename detection with duplicate content",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const projectDir = join(tempDir, "project");
        await Deno.mkdir(projectDir, { recursive: true });

        // Create two files with identical content
        const sameContent = "identical content";
        await Deno.writeTextFile(join(projectDir, "file1.ts"), sameContent);
        await Deno.writeTextFile(join(projectDir, "file2.ts"), sameContent);

        // But the mtimes should be the same, so that it's ambiguous
        await Deno.utime(join(projectDir, "file2.ts"), 0, 0);
        await Deno.utime(join(projectDir, "file1.ts"), 0, 0);

        // Push initial files
        await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
        });

        // Get original file IDs
        const file1 = await sdk.projects.files
          .retrieve(project.id, { path: "project/file1.ts" })
          .then((resp) => resp.data[0]);
        const file2 = await sdk.projects.files
          .retrieve(project.id, { path: "project/file2.ts" })
          .then((resp) => resp.data[0]);

        // Delete both files and create two new files with the same content
        await Deno.remove(join(projectDir, "file1.ts"));
        await Deno.remove(join(projectDir, "file2.ts"));
        await Deno.writeTextFile(join(projectDir, "newfile1.ts"), sameContent);
        await Deno.writeTextFile(join(projectDir, "newfile2.ts"), sameContent);

        // Push changes
        const { itemStateChanges: result } = await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
        });

        // Verify no renames were detected due to duplicate content
        assertEquals(
          result.renamed.length,
          0,
          "No renames should be detected with duplicate content",
        );
        assertEquals(
          result.deleted.length,
          2,
          "both original files should be marked as deleted",
        );
        assertEquals(
          result.created.length,
          2,
          "both new files should be marked as created",
        );

        // Verify new files have different IDs than original files
        const newFile1 = await sdk.projects.files
          .retrieve(project.id, { path: "project/newfile1.ts" })
          .then((resp) => resp.data[0]);
        const newFile2 = await sdk.projects.files
          .retrieve(project.id, { path: "project/newfile2.ts" })
          .then((resp) => resp.data[0]);

        assert(
          newFile1.id !== file1.id,
          "new file should have different id than original file",
        );
        assert(
          newFile2.id !== file2.id,
          "new file should have different id than original file",
        );
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "test moving file to subdirectory",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn(t) {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const originalFilePath = join(tempDir, "test_cron.ts");
        const fileContent = "console.log('Hello, world!');";

        await t.step("create a file and push it", async () => {
          await Deno.writeTextFile(originalFilePath, fileContent);
          await push({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
          });

          // Verify file exists at original location
          const fileExists = await projectItemExists(
            project.id,
            branch.id,
            "test_cron.ts",
            await getLatestVersion(project.id, branch.id),
          );
          assert(fileExists, "file should exist after creation");
        });

        // Get the original file ID
        const originalFile = await sdk.projects.files
          .retrieve(project.id, { path: "test_cron.ts" })
          .then((resp) => resp.data[0]);

        await t.step("move file to subdirectory", async () => {
          // Move file to subdirectory
          const subDir = join(tempDir, "subdir");
          await Deno.mkdir(subDir, { recursive: true });
          const newFilePath = join(subDir, "moved_file.ts");
          await Deno.remove(originalFilePath);
          await Deno.writeTextFile(newFilePath, fileContent);

          // Push the changes
          await push({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
          });
        });

        await t.step("verify file moved correctly", async () => {
          // Verify file exists at new location
          const fileExistsAtNewPath = await projectItemExists(
            project.id,
            branch.id,
            "subdir/moved_file.ts",
            await getLatestVersion(project.id, branch.id),
          );
          assert(fileExistsAtNewPath, "file should exist at new location");

          // Verify file no longer exists at original location
          const fileExistsAtOldPath = await projectItemExists(
            project.id,
            branch.id,
            "test_file.ts",
            await getLatestVersion(project.id, branch.id),
          );
          assert(
            !fileExistsAtOldPath,
            "File should not exist at original location",
          );

          // Verify the file ID is preserved (same file)
          const movedFile = await sdk.projects.files
            .retrieve(project.id, { path: "subdir/moved_file.ts" })
            .then((resp) => resp.data[0]);
          assertEquals(
            originalFile.id,
            movedFile.id,
            "file id should be preserved after move",
          );
        });
      });
    });
  },
  sanitizeResources: false,
});

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
          const fileExists = await projectItemExists(
            project.id,
            branch.id,
            vtFilePath,
            await getLatestVersion(project.id, branch.id),
          );
          assert(!fileExists, "file should have been deleted");
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "test renaming file without content change",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const projectDir = join(tempDir, "project");

        // Create and push original file
        await Deno.mkdir(projectDir, { recursive: true });
        await Deno.writeTextFile(
          join(projectDir, "original.ts"),
          "unchanged content",
        );

        await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
        });

        // Get the id of the original file
        const originalFile = await sdk.projects.files
          .retrieve(project.id, { path: "project/original.ts" })
          .then((resp) => resp.data[0]);

        // Rename file without changing content
        await Deno.remove(join(projectDir, "original.ts"));
        await Deno.writeTextFile(
          join(projectDir, "renamed.ts"),
          "unchanged content",
        );

        // Push renamed file
        const { itemStateChanges: statusResult } = await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
        });

        // Verify rename was detected
        assertEquals(statusResult.renamed.length, 1);
        assertEquals(statusResult.renamed[0].oldPath, "project/original.ts");
        assertEquals(statusResult.renamed[0].path, "project/renamed.ts");
        assertEquals(statusResult.renamed[0].status, "renamed");

        // Verify file ID is preserved (same file)
        const renamedFile = await sdk.projects.files.retrieve(
          project.id,
          { path: "project/renamed.ts" },
        ).then((resp) => resp.data[0]);
        assertEquals(originalFile.id, renamedFile.id);

        // Verify old file is gone
        const oldFileExists = await projectItemExists(
          project.id,
          branch.id,
          "project/original.ts",
          await getLatestVersion(project.id, branch.id),
        );
        assert(!oldFileExists, "Old file should not exist after rename");
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "test renaming file",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn(t) {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const projectDir = join(tempDir, "project");

        await t.step("create a file and push it", async () => {
          // Create and push original file
          await Deno.mkdir(projectDir, { recursive: true });
          await Deno.writeTextFile(
            join(projectDir, "old.http.ts"),
            "content",
          );

          await push({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
          });
        });

        // Get the id of the original file
        const originalFile = await sdk.projects.files
          .retrieve(project.id, { path: "project/old.http.ts" })
          .then((resp) => resp.data[0]);

        await t.step("rename the file and push changes", async () => {
          // Rename file (delete old, create new)
          await Deno.remove(join(projectDir, "old.http.ts"));
          // (slightly modified, but less than 50%)
          await Deno.writeTextFile(join(projectDir, "new.tsx"), "contentt");

          // Push renamed file
          const { itemStateChanges: statusResult } = await push({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
          });

          // Verify rename was detected
          assertEquals(statusResult.renamed.length, 1);
          assertEquals(statusResult.renamed[0].type, "http");
          assertEquals(statusResult.renamed[0].oldPath, "project/old.http.ts");
          assertEquals(statusResult.renamed[0].path, "project/new.tsx");
          assertEquals(statusResult.renamed[0].status, "renamed");
        });

        await t.step("verify file content, type, and uuid", async () => {
          // Verify file ID is preserved (same file)
          const renamedFile = await sdk.projects.files.retrieve(
            project.id,
            { path: "project/new.tsx" },
          ).then((resp) => resp.data[0]);
          assertEquals(originalFile.id, renamedFile.id);

          // Verify file type is preserved
          assertEquals(renamedFile.type, "http");

          // Verify content is preserved
          const content = await sdk.projects.files
            .getContent(project.id, {
              path: "project/new.tsx",
              branch_id: branch.id,
            })
            .then((resp) => resp.text());
          assertEquals(content, "contentt");
        });

        await t.step("ensure file no longer exists at old path", async () => {
          // Verify old file is gone
          const oldFileExists = await projectItemExists(
            project.id,
            branch.id,
            "project/old.http.ts",
            await getLatestVersion(project.id, branch.id),
          );
          assert(!oldFileExists, "Old file should not exist after rename");
        });
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
        const { itemStateChanges: pushResult } = await push({
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
          branch.id,
          await getLatestVersion(project.id, branch.id),
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
  sanitizeResources: false,
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
        const { itemStateChanges: result } = await push({
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
        const fileExists = await projectItemExists(
          project.id,
          branch.id,
          vtFilePath,
          await getLatestVersion(project.id, branch.id),
        );
        assert(!fileExists, "File should not exist on server after dry run");
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
        const { itemStateChanges: firstResult } = await push({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
        });

        // Verify that FileState reports the file was created. We have better
        // tests for ensuring this operation with more detail, this is just to
        // make sure it's idempotent.
        assertEquals(firstResult.created.length, 1);
        assertEquals(firstResult.size(), 1);

        const { itemStateChanges: secondResult } = await push({
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
  sanitizeResources: false,
});
