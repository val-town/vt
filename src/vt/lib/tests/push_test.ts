import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import sdk, { getLatestVersion, listValItems, valItemExists } from "~/sdk.ts";
import { push } from "~/vt/lib/push.ts";
import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";

Deno.test({
  name: "test renaming file at root",
  permissions: "inherit",
  async fn() {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const oldFilePath = join(tempDir, "rootFile.txt");

        // Create and push the original file
        await Deno.writeTextFile(oldFilePath, "root file content");
        await push({
          targetDir: tempDir,
          valId: val.id,
          branchId: branch.id,
        });

        // Rename the file at the root
        const newFilePath = join(tempDir, "renamedRootFile.txt");
        await Deno.rename(oldFilePath, newFilePath);

        // Push the renamed file
        const { itemStateChanges: result } = await push({
          targetDir: tempDir,
          valId: val.id,
          branchId: branch.id,
        });

        // Verify rename was detected
        assertEquals(result.renamed.length, 1);
        assertEquals(result.renamed[0].oldPath, "rootFile.txt");
        assertEquals(result.renamed[0].path, "renamedRootFile.txt");

        // If this doesn't throw it means it exists
        assert(
          await valItemExists(
            val.id,
            branch.id,
            "renamedRootFile.txt",
            await getLatestVersion(val.id, branch.id),
          ),
          "file should exist at new location",
        );

        assert(
          !await valItemExists(
            val.id,
            branch.id,
            "rootFile.txt",
            await getLatestVersion(val.id, branch.id),
          ),
          "file should not exist at old location",
        );
      });
    });
  },
});

Deno.test({
  name: "test moving file from subdirectory to root",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tempDir) => {
      await doWithNewVal(async ({ val, branch }) => {
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
            valId: val.id,
            branchId: branch.id,
          });
          assert(
            await valItemExists(
              val.id,
              branch.id,
              "subdir/test.txt",
              await getLatestVersion(val.id, branch.id),
            ),
            "file should exist in subdir",
          );
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
            valId: val.id,
            branchId: branch.id,
          });
          assertEquals(secondPush.renamed.length, 1);
          assertEquals(secondPush.renamed[0].oldPath, "subdir/test.txt");
          assertEquals(secondPush.renamed[0].path, "test.txt");
        });

        await t.step("ensure push is idempotent", async () => {
          // Push again with no changes
          const { itemStateChanges: thirdPush } = await push({
            targetDir: tempDir,
            valId: val.id,
            branchId: branch.id,
          });

          // Final push should have no changes
          assertEquals(thirdPush.not_modified.length, 2);
          assertEquals(thirdPush.size(), 2);
        });
      });
    });
  },
});

Deno.test({
  name: "test ambiguous rename detection with duplicate content",
  permissions: "inherit",
  async fn() {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const valDir = join(tempDir, "val");
        await Deno.mkdir(valDir, { recursive: true });

        // Create two files with identical content
        const sameContent = "identical content";
        await Deno.writeTextFile(join(valDir, "file1.ts"), sameContent);
        await Deno.writeTextFile(join(valDir, "file2.ts"), sameContent);

        // But the mtimes should be the same, so that it's ambiguous
        await Deno.utime(join(valDir, "file2.ts"), 0, 0);
        await Deno.utime(join(valDir, "file1.ts"), 0, 0);

        // Push initial files
        await push({
          targetDir: tempDir,
          valId: val.id,
          branchId: branch.id,
        });

        // Get original file IDs
        const file1 = await sdk.vals.files
          .retrieve(val.id, { path: "val/file1.ts", recursive: true })
          .then((resp) => resp.data[0]);
        const file2 = await sdk.vals.files
          .retrieve(val.id, { path: "val/file2.ts", recursive: true })
          .then((resp) => resp.data[0]);

        // Delete both files and create two new files with the same content
        await Deno.remove(join(valDir, "file1.ts"));
        await Deno.remove(join(valDir, "file2.ts"));
        await Deno.writeTextFile(join(valDir, "newfile1.ts"), sameContent);
        await Deno.writeTextFile(join(valDir, "newfile2.ts"), sameContent);

        // Push changes
        const { itemStateChanges: result } = await push({
          targetDir: tempDir,
          valId: val.id,
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
        const newFile1 = await sdk.vals.files
          .retrieve(val.id, {
            path: "val/newfile1.ts",
            recursive: true,
          })
          .then((resp) => resp.data[0]);
        const newFile2 = await sdk.vals.files
          .retrieve(val.id, {
            path: "val/newfile2.ts",
            recursive: true,
          })
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
});

Deno.test({
  name: "test moving file to subdirectory",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const originalFilePath = join(tempDir, "test_cron.ts");
        const fileContent = "console.log('Hello, world!');";

        await t.step("create a file and push it", async () => {
          await Deno.writeTextFile(originalFilePath, fileContent);
          await push({
            targetDir: tempDir,
            valId: val.id,
            branchId: branch.id,
          });

          // Verify file exists at original location
          const fileExists = await valItemExists(
            val.id,
            branch.id,
            "test_cron.ts",
            await getLatestVersion(val.id, branch.id),
          );
          assert(fileExists, "file should exist after creation");
        });

        // Get the original file ID
        const originalFile = await sdk.vals.files
          .retrieve(val.id, { path: "test_cron.ts", recursive: true })
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
            valId: val.id,
            branchId: branch.id,
          });
        });

        await t.step("verify file moved correctly", async () => {
          // Verify file exists at new location
          const fileExistsAtNewPath = await valItemExists(
            val.id,
            branch.id,
            "subdir/moved_file.ts",
            await getLatestVersion(val.id, branch.id),
          );
          assert(fileExistsAtNewPath, "file should exist at new location");

          // Verify file no longer exists at original location
          const fileExistsAtOldPath = await valItemExists(
            val.id,
            branch.id,
            "test_file.ts",
            await getLatestVersion(val.id, branch.id),
          );
          assert(
            !fileExistsAtOldPath,
            "File should not exist at original location",
          );

          // Verify the file ID is preserved (same file)
          const movedFile = await sdk.vals.files
            .retrieve(val.id, {
              path: "subdir/moved_file.ts",
              recursive: true,
            })
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
});

Deno.test({
  name: "test typical pushing",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const vtFilePath = "test.txt";
        const localFilePath = join(tempDir, vtFilePath);

        await t.step("create a file and push it", async () => {
          await Deno.writeTextFile(localFilePath, "test");
          await push({
            targetDir: tempDir,
            valId: val.id,
            branchId: branch.id,
          });

          // Pull and assert that the creation worked
          const originalFileContent = await sdk.vals.files
            .getContent(val.id, {
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
            valId: val.id,
            branchId: branch.id,
          });

          // Pull and assert that the modification worked
          const newFileContent = await sdk.vals.files
            .getContent(val.id, {
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
            valId: val.id,
            branchId: branch.id,
          });

          // Assert that the file no longer exists on the remote
          const fileExists = await valItemExists(
            val.id,
            branch.id,
            vtFilePath,
            await getLatestVersion(val.id, branch.id),
          );
          assert(!fileExists, "file should have been deleted");
        });
      });
    });
  },
});

Deno.test({
  name: "test renaming file without content change",
  permissions: "inherit",
  async fn() {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const valDir = join(tempDir, "val");

        // Create and push original file
        await Deno.mkdir(valDir, { recursive: true });
        await Deno.writeTextFile(
          join(valDir, "original.ts"),
          "unchanged content",
        );

        await push({
          targetDir: tempDir,
          valId: val.id,
          branchId: branch.id,
        });

        // Get the id of the original file
        const originalFile = await sdk.vals.files
          .retrieve(val.id, {
            path: "val/original.ts",
            recursive: true,
          })
          .then((resp) => resp.data[0]);

        // Rename file without changing content
        await Deno.remove(join(valDir, "original.ts"));
        await Deno.writeTextFile(
          join(valDir, "renamed.ts"),
          "unchanged content",
        );

        // Push renamed file
        const { itemStateChanges: statusResult } = await push({
          targetDir: tempDir,
          valId: val.id,
          branchId: branch.id,
        });

        // Verify rename was detected
        assertEquals(statusResult.renamed.length, 1);
        assertEquals(statusResult.renamed[0].oldPath, "val/original.ts");
        assertEquals(statusResult.renamed[0].path, "val/renamed.ts");
        assertEquals(statusResult.renamed[0].status, "renamed");

        // Verify file ID is preserved (same file)
        const renamedFile = await sdk.vals.files.retrieve(
          val.id,
          { path: "val/renamed.ts", recursive: true },
        ).then((resp) => resp.data[0]);
        assertEquals(originalFile.id, renamedFile.id);

        // Verify old file is gone
        const oldFileExists = await valItemExists(
          val.id,
          branch.id,
          "val/original.ts",
          await getLatestVersion(val.id, branch.id),
        );
        assert(!oldFileExists, "Old file should not exist after rename");
      });
    });
  },
});

Deno.test({
  name: "test renaming file",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const valDir = join(tempDir, "val");

        await t.step("create a file and push it", async () => {
          // Create and push original file
          await Deno.mkdir(valDir, { recursive: true });
          await Deno.writeTextFile(
            join(valDir, "old.http.ts"),
            "content",
          );

          await push({
            targetDir: tempDir,
            valId: val.id,
            branchId: branch.id,
          });
        });

        // Get the id of the original file
        const originalFile = await sdk.vals.files
          .retrieve(val.id, {
            path: "val/old.http.ts",
            recursive: true,
          })
          .then((resp) => resp.data[0]);

        await t.step("rename the file and push changes", async () => {
          // Rename file (delete old, create new)
          await Deno.remove(join(valDir, "old.http.ts"));
          // (slightly modified, but less than 50%)
          await Deno.writeTextFile(join(valDir, "new.tsx"), "contentt");

          // Push renamed file
          const { itemStateChanges: statusResult } = await push({
            targetDir: tempDir,
            valId: val.id,
            branchId: branch.id,
          });

          // Verify rename was detected
          assertEquals(statusResult.renamed.length, 1);
          assertEquals(statusResult.renamed[0].type, "http");
          assertEquals(statusResult.renamed[0].oldPath, "val/old.http.ts");
          assertEquals(statusResult.renamed[0].path, "val/new.tsx");
          assertEquals(statusResult.renamed[0].status, "renamed");
        });

        await t.step("verify file content, type, and uuid", async () => {
          // Verify file ID is preserved (same file)
          const renamedFile = await sdk.vals.files.retrieve(
            val.id,
            { path: "val/new.tsx", recursive: true },
          ).then((resp) => resp.data[0]);
          assertEquals(originalFile.id, renamedFile.id);

          // Verify file type is preserved
          assertEquals(renamedFile.type, "http");

          // Verify content is preserved
          const content = await sdk.vals.files
            .getContent(val.id, {
              path: "val/new.tsx",
              branch_id: branch.id,
            })
            .then((resp) => resp.text());
          assertEquals(content, "contentt");
        });

        await t.step("ensure file no longer exists at old path", async () => {
          // Verify old file is gone
          const oldFileExists = await valItemExists(
            val.id,
            branch.id,
            "val/old.http.ts",
            await getLatestVersion(val.id, branch.id),
          );
          assert(!oldFileExists, "Old file should not exist after rename");
        });
      });
    });
  },
});

Deno.test({
  name: "test pushing empty directory",
  permissions: "inherit",
  async fn() {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create an empty directory
        const emptyDirPath = join(tempDir, "empty_dir");
        await Deno.mkdir(emptyDirPath, { recursive: true });

        // Push the empty directory
        const { itemStateChanges: pushResult } = await push({
          targetDir: tempDir,
          valId: val.id,
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
        const listResult = await listValItems(
          val.id,
          branch.id,
          await getLatestVersion(val.id, branch.id),
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
  permissions: "inherit",
  async fn() {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create a file
        const vtFilePath = "test.txt";
        const localFilePath = join(tempDir, vtFilePath);
        await Deno.writeTextFile(localFilePath, "test content");

        // Push with dryRun enabled
        const { itemStateChanges: result } = await push({
          targetDir: tempDir,
          valId: val.id,
          branchId: branch.id,
          dryRun: true,
        });

        // Verify that FileState reports correct changes
        assertEquals(result.created.length, 1);
        assertEquals(result.created[0].path, vtFilePath);
        assertEquals(result.created[0].status, "created");
        assertEquals(result.created[0].type, "file");

        // Assert that the file was NOT actually pushed to the server
        const fileExists = await valItemExists(
          val.id,
          branch.id,
          vtFilePath,
          await getLatestVersion(val.id, branch.id),
        );
        assert(!fileExists, "File should not exist on server after dry run");
      });
    });
  },
});

Deno.test({
  name: "test push with no changes",
  permissions: "inherit",
  async fn() {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create a file
        const vtFilePath = "test.txt";
        const localFilePath = join(tempDir, vtFilePath);
        await Deno.writeTextFile(localFilePath, "test content");

        // Do the push
        const { itemStateChanges: firstResult } = await push({
          targetDir: tempDir,
          valId: val.id,
          branchId: branch.id,
        });

        // Verify that FileState reports the file was created. We have better
        // tests for ensuring this operation with more detail, this is just to
        // make sure it's idempotent.
        assertEquals(firstResult.created.length, 1);
        assertEquals(firstResult.size(), 1);

        const { itemStateChanges: secondResult } = await push({
          targetDir: tempDir,
          valId: val.id,
          branchId: branch.id,
        });
        // Should be no changes on the second push
        assertEquals(secondResult.not_modified.length, 1);
        assertEquals(secondResult.size(), 1);
      });
    });
  },
});

Deno.test({
  name: "test push with file warnings (empty and too large)",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Import MAX_FILE_CHARS from consts to ensure test is accurate
        const { MAX_FILE_CHARS } = await import("~/consts.ts");

        await t.step("create files with warnings", async () => {
          // Create an empty file (will get "empty" warning)
          const emptyFilePath = join(tempDir, "empty.txt");
          await Deno.writeTextFile(emptyFilePath, "");

          // Create a file that's too large (will get "too_large" warning)
          const largeTxtPath = join(tempDir, "too_large.txt");
          // Create string that exceeds MAX_FILE_CHARS by a small amount
          const largeContent = "x".repeat(MAX_FILE_CHARS + 100);
          await Deno.writeTextFile(largeTxtPath, largeContent);

          // Create a normal file for comparison
          const normalFilePath = join(tempDir, "normal.txt");
          await Deno.writeTextFile(normalFilePath, "This is normal content");
        });

        await t.step("push and verify warnings", async () => {
          // Push all files
          const { itemStateChanges } = await push({
            targetDir: tempDir,
            valId: val.id,
            branchId: branch.id,
          });

          // Check that warnings were properly detected
          const emptyFile = itemStateChanges.all().find((item) =>
            item.path === "empty.txt"
          );
          const largeFile = itemStateChanges.all().find((item) =>
            item.path === "too_large.txt"
          );
          const normalFile = itemStateChanges.all().find((item) =>
            item.path === "normal.txt"
          );

          assert(emptyFile, "empty file should be in the status");
          assert(largeFile, "too large file should be in the status");
          assert(normalFile, "normal file should be in the status");

          assert(
            emptyFile.warnings?.includes("empty"),
            "empty file should have 'empty' warning",
          );

          assert(
            largeFile.warnings?.includes("too_large"),
            "large file should have 'too_large' warning",
          );

          assert(
            !normalFile.warnings?.length,
            "normal file should not have warnings",
          );
        });

        await t.step("verify only safe files were uploaded", async () => {
          // Check that only the normal file was actually uploaded to the server
          const latestVersion = await getLatestVersion(val.id, branch.id);

          // Normal file should exist
          const normalFileExists = await valItemExists(
            val.id,
            branch.id,
            "normal.txt",
            latestVersion,
          );
          assert(normalFileExists, "normal file should exist on server");

          // Files with warnings should NOT exist
          const emptyFileExists = await valItemExists(
            val.id,
            branch.id,
            "empty.txt",
            latestVersion,
          );
          assert(!emptyFileExists, "empty file should NOT exist on server");

          const largeFileExists = await valItemExists(
            val.id,
            branch.id,
            "too_large.txt",
            latestVersion,
          );
          assert(!largeFileExists, "too large file should NOT exist on server");
        });
      });
    });
  },
});

Deno.test({
  name: "test push with read-only files",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create multiple files - some will be made read-only
        const normalFilePath = join(tempDir, "writable.txt");
        const readOnlyFilePath = join(tempDir, "readonly.txt");
        const anotherFilePath = join(tempDir, "another.txt");

        await t.step("create initial files and push", async () => {
          // Create the files with initial content
          await Deno.writeTextFile(normalFilePath, "writable file content");
          await Deno.writeTextFile(readOnlyFilePath, "readonly file content");
          await Deno.writeTextFile(anotherFilePath, "another file content");

          // First push to establish files on the server
          const { itemStateChanges: initialPush } = await push({
            targetDir: tempDir,
            valId: val.id,
            branchId: branch.id,
          });

          // Verify all files were created successfully
          assertEquals(
            initialPush.created.length,
            3,
            "all three files should be created",
          );

          // Make one file read-only (no write permission)
          await Deno.chmod(readOnlyFilePath, 0o444);
        });

        await t.step("modify writable files and push again", async () => {
          // Modify only the writable files
          await Deno.writeTextFile(normalFilePath, "updated writable content");
          await Deno.writeTextFile(anotherFilePath, "updated another content");

          // Try to push all changes
          const { itemStateChanges: secondPush } = await push({
            targetDir: tempDir,
            valId: val.id,
            branchId: branch.id,
          });

          // Verify push succeeded with correct file states
          // We expect the read-only file to be in not_modified state
          // and the two writable files to be in modified state
          const readOnlyFile = secondPush.all()
            .find((item) => item.path === "readonly.txt");
          const writableFile = secondPush.all()
            .find((item) => item.path === "writable.txt");
          const anotherFile = secondPush.all()
            .find((item) => item.path === "another.txt");

          assert(readOnlyFile, "read-only file should be in status results");
          assert(writableFile, "writable file should be in status results");
          assert(anotherFile, "another file should be in status results");

          assertEquals(
            readOnlyFile.status,
            "not_modified",
            "read-only file should be not modified",
          );
          assertEquals(
            writableFile.status,
            "modified",
            "writable file should be modified",
          );
          assertEquals(
            anotherFile.status,
            "modified",
            "another file should be modified",
          );
        });

        await t.step("verify server state after push", async () => {
          // Check content on the server to verify the push succeeded
          const writableContent = await sdk.vals.files
            .getContent(val.id, {
              path: "writable.txt",
              branch_id: branch.id,
            })
            .then((resp) => resp.text());

          const readOnlyContent = await sdk.vals.files
            .getContent(val.id, {
              path: "readonly.txt",
              branch_id: branch.id,
            })
            .then((resp) => resp.text());

          const anotherContent = await sdk.vals.files
            .getContent(val.id, {
              path: "another.txt",
              branch_id: branch.id,
            })
            .then((resp) => resp.text());

          // Verify the content matches what we expect
          assertEquals(
            writableContent,
            "updated writable content",
            "Writable file content should be updated on server",
          );
          assertEquals(
            readOnlyContent,
            "readonly file content",
            "read-only file content should remain unchanged",
          );
          assertEquals(
            anotherContent,
            "updated another content",
            "another file content should be updated on server",
          );
        });

        // Clean up by making the file writable again for proper deletion
        await Deno.chmod(readOnlyFilePath, 0o666);
      });
    });
  },
});
