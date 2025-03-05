import { assert, assertEquals, assertExists } from "@std/assert";
import sdk from "~/sdk.ts";
import { create } from "~/vt/git/create.ts";
import { withTempDir } from "~/vt/git/utils.ts";
import * as path from "@std/path";

Deno.test({
  name: "creates new project with files and verifies creation",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn() {
    const { tempDir, cleanup } = await withTempDir("vt_create_test");

    try {
      // Setup test data
      const projectName = "test-" + crypto.randomUUID().slice(0, 8);
      const privacy = "public";
      const description = "Test project description";

      // Create the project
      const { projectId } = await create({
        targetDir: tempDir,
        projectName,
        privacy,
        description,
      });

      // Create a test file in the project directory
      const testFilePath = path.join(tempDir, "test.ts");
      const testFileContent = 'console.log("Hello, Val Town!");';
      await Deno.writeTextFile(testFilePath, testFileContent);

      // Verify the directory was created
      const dirInfo = await Deno.stat(tempDir);

      // Fetch the project by ID
      const project = await sdk.projects.retrieve(projectId);

      // Assertions
      assertExists(projectId, "Project ID should be returned");
      assertEquals(project.name, projectName, "Project name should match");
      assertEquals(project.privacy, privacy, "Project privacy should match");
      assertEquals(
        project.description,
        description,
        "Project description should match",
      );
      assert(dirInfo.isDirectory, "Target directory should be created");

      // Verify test file exists
      const fileContent = await Deno.readTextFile(testFilePath);
      assertEquals(
        fileContent,
        testFileContent,
        "File content should match what was written",
      );
    } finally {
      await cleanup();
      // TODO: Remove project from Val Town when API supports it
    }
  },
});
