import { clone } from "~/vt/git/clone.ts";
import { withTempDir } from "~/vt/git/utils.ts";
import sdk, { branchNameToId } from "~/sdk.ts";
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
    const { tempDir, cleanup } = await withTempDir("vt_push_test");

    try {
      // Create a blank project
      const project = await sdk.projects.create({
        name: crypto.randomUUID().slice(10),
        description: "This is a test project",
        privacy: "public",
      });

      const branch = await branchNameToId(project.id, "main");

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
    } finally {
      await cleanup();
    }
  },
});
