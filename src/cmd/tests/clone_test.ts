import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import sdk, { randomProjectName, user } from "~/sdk.ts";
import type { ProjectFileType } from "~/consts.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";

Deno.test({
  name: "clone preserves custom deno.json and .vtignore",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
    run: true,
  },
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        const customDenoJson = '{"tasks":{"custom":"echo test"}}';
        const customVtignore = "custom_ignore_pattern";

        await t.step("set up custom config files", async () => {
          // Create custom deno.json
          await sdk.projects.files.create(
            project.id,
            {
              path: "deno.json",
              content: customDenoJson,
              branch_id: branch.id,
              type: "file" as ProjectFileType,
            },
          );

          // Create custom .vtignore
          await sdk.projects.files.create(
            project.id,
            {
              path: ".vtignore",
              content: customVtignore,
              branch_id: branch.id,
              type: "file" as ProjectFileType,
            },
          );
        });

        await t.step("clone and verify custom config files", async () => {
          const cloneDir = join(tmpDir, "config-clone");
          await runVtCommand([
            "clone",
            project.name,
            cloneDir,
          ], tmpDir);

          // Verify deno.json content
          const denoJsonContent = await Deno.readTextFile(
            join(cloneDir, "deno.json"),
          );
          assertEquals(
            denoJsonContent,
            customDenoJson,
            "custom deno.json should be preserved",
          );

          // Verify .vtignore content
          const vtignoreContent = await Deno.readTextFile(
            join(cloneDir, ".vtignore"),
          );
          assertEquals(
            vtignoreContent,
            customVtignore,
            "custom .vtignore should be preserved",
          );
        });
      });
    });
  },
});

Deno.test({
  name: "clone a newly created project",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
    run: true,
  },
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewProject(async ({ project, branch }) => {
        await t.step("set up the project structure", async () => {
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
        });

        await t.step("clone the project and assert the structure", async () => {
          const cloneDir = join(tmpDir, "cloned");
          await runVtCommand([
            "clone",
            project.name,
            cloneDir,
          ], tmpDir);

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
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      const projectName = randomProjectName("clone_test");

      try {
        await t.step("create a new project", async () => {
          await runVtCommand([
            "create",
            projectName,
          ], tmpDir);
        });

        const targetDir = join(tmpDir, "test-project-dir");

        await t.step("clone the new project", async () => {
          const [output] = await runVtCommand([
            "clone",
            projectName,
            targetDir,
          ], tmpDir);

          assertStringIncludes(
            output,
            `Project ${user.username!}/${projectName} cloned to`,
          );

          assert(
            await exists(join(tmpDir, projectName)),
            "project directory was not created",
          );
        });
      } finally {
        const { id } = await sdk.alias.username.projectName.retrieve(
          user.username!,
          projectName,
        );
        await sdk.projects.delete(id);
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
      const [out] = await runVtCommand([
        "clone",
        "nonexistentproject123456",
      ], tmpDir);

      assertStringIncludes(out, "Project not found");
    });
  },
});
