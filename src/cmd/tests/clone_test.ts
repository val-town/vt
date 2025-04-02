import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import sdk, { randomProjectName, user } from "~/sdk.ts";
import type { ProjectFileType } from "~/consts.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";

Deno.test({
  name: "clone a newly created project",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
    run: true,
  },
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        // Create the directory first
        await sdk.projects.files.create(
          project.id,
          {
            path: "foo",
            branch_id: branch.id,
            type: "directory",
          },
        );

        // Create empty test.js file
        await sdk.projects.files.create(
          project.id,
          {
            path: "test.js",
            content: "",
            branch_id: branch.id,
            type: "file" as ProjectFileType,
          },
        );

        // Create test_inner.js with content
        await sdk.projects.files.create(
          project.id,
          {
            path: "foo/test_inner.js",
            content:
              "export function test() { return 'Hello from test_inner'; }",
            branch_id: branch.id,
            type: "file" as ProjectFileType,
          },
        );

        // Clone the project to a subdirectory of the temp dir
        const cloneDir = join(tmpDir, "cloned");

        // Run clone command as a subprocess
        await runVtCommand(["clone", project.name, cloneDir], tmpDir);

        // Verify the files exist
        const testJsExists = await exists(join(cloneDir, "test.js"));
        assertEquals(testJsExists, true, "test.js should exist");

        const innerFileExists = await exists(
          join(cloneDir, "foo/test_inner.js"),
        );
        assertEquals(innerFileExists, true, "foo/test_inner.js should exist");

        // Verify the content of test_inner.js
        const innerContent = await Deno.readTextFile(
          join(cloneDir, "foo/test_inner.js"),
        );
        assertEquals(
          innerContent,
          "export function test() { return 'Hello from test_inner'; }",
          "content of test_inner.js should match",
        );
      });
    });
  },
});

Deno.test({
  name: "clone command output",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
    run: true,
  },
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      const projectName = randomProjectName("clone_test");

      try {
        await runVtCommand(["create", projectName], tmpDir);

        const targetDir = join(tmpDir, "test-project-dir");

        const [output] = await runVtCommand(
          ["clone", projectName, targetDir],
          tmpDir,
        );

        assertStringIncludes(
          output,
          `Project ${user.username!}/${projectName} cloned to`,
        );
      } finally {
        // Make sure the promise is properly awaited
        const result = await sdk.alias.username.projectName.retrieve(
          user.username!,
          projectName,
        );
        await sdk.projects.delete(result.id);
      }
    });
  },
});

Deno.test({
  name: "clone command with inexistant project",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
    run: true,
  },
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      const [out] = await runVtCommand(
        ["clone", "nonexistentproject123456"],
        tmpDir,
      );

      assertStringIncludes(out, "Project not found");
    });
  },
});
