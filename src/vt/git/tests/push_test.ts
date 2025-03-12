import { clone } from "~/vt/git/clone.ts";
import { doWithTempDir } from "~/vt/git/utils.ts";
import { doWithNewProject } from "~/vt/git/tests/utils.ts";
import sdk from "~/sdk.ts";
import { push } from "~/vt/git/push.ts";
import { assertEquals } from "@std/assert";
import { join } from "@std/path";

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
          ignoreGlobs: [],
        });

        // Pull and assert that the creation worked
        const originalFileContent = await sdk.projects.files
          .getContent(project.id, vtFilePath)
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
          ignoreGlobs: [],
        });

        // Pull and assert that the modification worked
        const newFileContent = await sdk.projects.files
          .getContent(project.id, vtFilePath)
          .then((resp) => resp.text());
        assertEquals(newFileContent, "test2");
      }, "vt_push_test");
    });
  },
});
