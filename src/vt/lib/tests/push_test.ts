import { doWithTempDir } from "~/vt/lib/utils.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import sdk from "~/sdk.ts";
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
        console.log(localFilePath);
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
