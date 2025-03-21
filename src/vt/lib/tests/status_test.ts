import { doWithTempDir } from "~/vt/lib/utils.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import sdk from "~/sdk.ts";
import { status, type StatusResult } from "~/vt/lib/status.ts";
import { assertEquals } from "@std/assert";
import { join } from "@std/path";

Deno.test({
  name: "test file status reporting",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        const remoteFile1 = "remote.txt";
        const remoteFile2 = "remote2.txt";

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

        const updatedVersion = branch.version + 2;

        // Create the same files locally but with modifications
        await Deno.writeTextFile(
          join(tempDir, remoteFile1),
          "remote file 1 - modified locally",
        );

        // Create a new local file that doesn't exist remotely
        const localOnlyFile = "local.txt";
        await Deno.writeTextFile(
          join(tempDir, localOnlyFile),
          "local only file",
        );

        // Run status check
        const result: StatusResult = await status({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          version: updatedVersion,
          gitignoreRules: [],
        });

        // Test file that exists in both places but was modified locally
        assertEquals(
          result.modified.length,
          1,
          "there should be 1 modified file",
        );
        assertEquals(
          result.modified[0].path,
          remoteFile1,
          "modified file should be remote.txt",
        );

        // Test local-only file (should be created)
        assertEquals(
          result.created.length,
          1,
          "there should be 1 created file",
        );
        assertEquals(
          result.created[0].path,
          localOnlyFile,
          "created file should be local.txt",
        );

        // Test file missing locally (should be deleted)
        assertEquals(
          result.deleted.length,
          1,
          "there should be 1 deleted file",
        );
        assertEquals(
          result.deleted[0].path,
          remoteFile2,
          "deleted file should be remote2.txt",
        );
      }, "vt_status_test_");
    });
  },
});

Deno.test({
  name: "test status with vtignore",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    await doWithNewProject(async ({ project, branch }) => {
      await doWithTempDir(async (tempDir) => {
        // Create a local file that matches gitignore pattern
        await Deno.mkdir(join(tempDir, "logs"), { recursive: true });
        await Deno.writeTextFile(
          join(tempDir, "logs/debug.log"),
          "debug log content",
        );

        // Create a non-ignored file
        await Deno.writeTextFile(
          join(tempDir, "readme.md"),
          "this is a readme file",
        );

        // Fetch the status
        const result: StatusResult = await status({
          targetDir: tempDir,
          projectId: project.id,
          branchId: branch.id,
          version: branch.version + 1,
          gitignoreRules: ["*.log"],
        });

        const allFiles = [
          ...result.modified,
          ...result.not_modified,
          ...result.created,
          ...result.deleted,
        ].map((file) => file.path);

        // The ignored files should not appear in any of the status categories
        assertEquals(
          allFiles.includes("logs"),
          false,
          "ignored directories should not appear in status results",
        );

        // The non-ignored file should appear in the status results
        assertEquals(
          allFiles.includes("readme.md"),
          true,
          "non-ignored files should appear in status results",
        );
      }, "vt_status_gitignore_test_");
    });
  },
});
