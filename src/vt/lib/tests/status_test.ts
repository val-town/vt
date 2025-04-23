import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import sdk, { getLatestVersion } from "~/sdk.ts";
import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { status } from "~/vt/lib/status.ts";
import type { ItemStatusManager } from "../utils/ItemStatusManager.ts";

Deno.test({
  name: "test status detects binary files",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create a binary file (contains null bytes)
        const binaryFilePath = join(tempDir, "binary-file.bin");
        const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0x00, 0x03]);
        await Deno.writeFile(binaryFilePath, binaryData);

        // Run status check
        const statusResult = await status({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          version: await getLatestVersion(project.id, branch.id),
        });

        // Find the binary file in created items
        const binaryFile = statusResult.created.find(
          (item) => item.path === "binary-file.bin",
        );

        // Verify the binary file is detected and has the is_binary warning
        assertEquals(
          binaryFile !== undefined,
          true,
          "binary file should be detected",
        );
        assertEquals(
          binaryFile?.warnings?.includes("binary"),
          true,
          "binary file should have is_binary warning",
        );
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "test status detects files with invalid names",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create a file with an invalid name (contains invalid characters)
        const invalidFileName = "file with spaces.txt";
        const invalidFilePath = join(tempDir, invalidFileName);
        await Deno.writeTextFile(invalidFilePath, "content");

        // Run status check
        const statusResult = await status({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          version: await getLatestVersion(project.id, branch.id),
        });

        // Find the file with invalid name in created items
        const invalidFile = statusResult.created.find(
          (item) => item.path === invalidFileName,
        );

        // Verify the file with invalid name is detected and has the bad_name warning
        assertEquals(
          invalidFile !== undefined,
          true,
          "file with invalid name should be detected",
        );
        assertEquals(
          invalidFile?.warnings?.includes("bad_name"),
          true,
          "file with invalid name should have bad_name warning",
        );
      });
    });
  },
  sanitizeResources: false,
});

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
            version: await getLatestVersion(project.id, branch.id),
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
  sanitizeResources: false,
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
          version: await getLatestVersion(project.id, branch.id),
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
  sanitizeResources: false,
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

          // Create original file A
          const oldPathA = join(folderPath, "oldA.txt");
          await Deno.writeTextFile(oldPathA, "content");

          // Create original file B
          const oldPathB = join(folderPath, "oldB.txt");
          await Deno.writeTextFile(oldPathB, "differentContent");

          // Push original files to remote
          await sdk.projects.files.create(project.id, {
            path: "folder/oldA.txt",
            content: "content",
            branch_id: branch.id,
            type: "file",
          });

          await sdk.projects.files.create(project.id, {
            path: "folder/oldB.txt",
            content: "differentContent",
            branch_id: branch.id,
            type: "file",
          });

          // Rename files (delete old, create new)
          await Deno.remove(oldPathA);
          await Deno.remove(oldPathB);

          // Create renamed file A with modified content
          const newPathA = join(folderPath, "renamedA.txt");
          await Deno.writeTextFile(newPathA, "contentModified");

          // Create renamed file B with same content
          const newPathB = join(folderPath, "renamedB.txt");
          await Deno.writeTextFile(newPathB, "differentContent");
        });

        await t.step("run a status check on the current state", async () => {
          // Run status check
          const statusResult = await status({
            targetDir: tempDir,
            projectId: project.id,
            branchId: branch.id,
            version: await getLatestVersion(project.id, branch.id),
          });

          // Check not_modified array
          assertEquals(statusResult.not_modified.length, 1);
          assertEquals(statusResult.not_modified[0].type, "directory");
          assertEquals(statusResult.not_modified[0].path, "folder");
          assertEquals(statusResult.not_modified[0].status, "not_modified");

          // Check renamed array - should have the file with unchanged content
          assertEquals(statusResult.renamed.length, 1);
          assertEquals(statusResult.renamed[0].type, "file");
          assertEquals(statusResult.renamed[0].path, "folder/renamedB.txt");
          assertEquals(statusResult.renamed[0].oldPath, "folder/oldB.txt");
          assertEquals(statusResult.renamed[0].status, "renamed");

          // Check created array - should have the file with modified content
          assertEquals(statusResult.created.length, 1);
          assertEquals(statusResult.created[0].type, "file");
          assertEquals(statusResult.created[0].path, "folder/renamedA.txt");
          assertEquals(statusResult.created[0].status, "created");

          // Check deleted array - should have the old file that was "modified"
          assertEquals(statusResult.deleted.length, 1);
          assertEquals(statusResult.deleted[0].type, "file");
          assertEquals(statusResult.deleted[0].path, "folder/oldA.txt");
          assertEquals(statusResult.deleted[0].status, "deleted");
        });
      });
    });
  },
  sanitizeResources: false,
});
