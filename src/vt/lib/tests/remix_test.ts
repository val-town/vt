import { doWithTempDir } from "../utils/doWithTempDir.ts";
import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import sdk, { user } from "~/sdk.ts";
import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { remix } from "~/vt/lib/remix.ts";

Deno.test({
  name: "remix preserves HTTP val type",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn(t) {
    await doWithNewProject(async ({ project }) => {
      // Create an HTTP val in the source project
      const httpValName = "foo_http";
      await sdk.projects.files.create(
        project.id,
        {
          path: `${httpValName}.ts`,
          content: "export default function handler(req: Request) {\n" +
            '  return new Response("Hello from HTTP val!");\n' +
            "}",
          type: "http",
        },
      );

      await doWithTempDir(async (destTmpDir) => {
        const remixedProjectName = `${project.name}_remixed`;

        // Remix the project
        await t.step("remix project with HTTP val", async () => {
          const result = await remix({
            targetDir: destTmpDir,
            srcProjectId: project.id,
            srcBranchId: "main",
            projectName: remixedProjectName,
            privacy: "public",
          });

          // Check that the result contains expected data
          assert(result.toProjectId, "Should return a project ID");
          assert(result.toVersion > 0, "Should return a valid version");
          assert(
            result.fileStateChanges.created.length > 0,
            "Should have created files",
          );

          // Check that the HTTP val exists in the remixed project
          const remixedHttpValPath = join(destTmpDir, `${httpValName}.ts`);

          assert(
            await exists(remixedHttpValPath),
            "HTTP val file should exist in remixed project",
          );

          // Check the file content
          const content = await Deno.readTextFile(remixedHttpValPath);
          assert(
            content.includes("export default function handler(req: Request)"),
            "HTTP val signature should be preserved",
          );

          // Verify the file type was preserved
          const remixedFile = await sdk.projects.files.retrieve(
            result.toProjectId,
            { path: `${httpValName}.ts` },
          ).then((resp) => resp.data[0]);

          assertEquals(
            remixedFile.type,
            "http",
            "HTTP val type should be preserved in remixed project",
          );
        });

        // Clean up the remixed project
        const { id } = await sdk.alias.username.projectName.retrieve(
          user.username!,
          remixedProjectName,
        );
        await sdk.projects.delete(id);
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "remix respects privacy settings",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn() {
    await doWithNewProject(async ({ project }) => {
      await doWithTempDir(async (destTmpDir) => {
        const remixedProjectName = `${project.name}_private`;

        // Remix as private project
        const result = await remix({
          targetDir: destTmpDir,
          srcProjectId: project.id,
          srcBranchId: "main",
          projectName: remixedProjectName,
          privacy: "private",
        });

        // Verify the project was created with private visibility
        const remixedProject = await sdk.projects.retrieve(result.toProjectId);

        assertEquals(
          remixedProject.privacy,
          "private",
          "Remixed project should have private visibility",
        );

        // Clean up
        await sdk.projects.delete(remixedProject.id);
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "remix with custom description",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn() {
    await doWithNewProject(async ({ project }) => {
      await doWithTempDir(async (destTmpDir) => {
        const remixedProjectName = `${project.name}_with_desc`;
        const customDescription =
          "This is a custom description for the remixed project";

        // Remix with custom description
        const result = await remix({
          targetDir: destTmpDir,
          srcProjectId: project.id,
          srcBranchId: "main",
          projectName: remixedProjectName,
          description: customDescription,
          privacy: "public",
        });

        // Verify the description was set correctly
        const remixedProject = await sdk.projects.retrieve(result.toProjectId);

        assertEquals(
          remixedProject.description,
          customDescription,
          "remixed project should have the custom description",
        );

        // Clean up
        await sdk.projects.delete(remixedProject.id);
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "remix basic functionality",
  permissions: {
    read: true,
    write: true,
    net: true,
    env: true,
  },
  async fn(t) {
    await doWithNewProject(async ({ project }) => {
      // Create a few files in the source project
      await sdk.projects.files.create(
        project.id,
        {
          path: "regular.ts",
          content: "export const hello = () => 'world';",
          type: "script",
        },
      );

      await sdk.projects.files.create(
        project.id,
        {
          path: "nested/file.txt",
          content: "This is a nested text file",
          type: "file",
        },
      );

      await doWithTempDir(async (destTmpDir) => {
        const remixedProjectName = `${project.name}_general`;

        await t.step("general remix test", async () => {
          // Perform the remix
          const result = await remix({
            targetDir: destTmpDir,
            srcProjectId: project.id,
            srcBranchId: "main",
            projectName: remixedProjectName,
            privacy: "public",
          });

          // Verify regular file was remixed
          const regularFilePath = join(destTmpDir, "regular.ts");
          assert(
            await exists(regularFilePath),
            "regular file should exist in remixed project",
          );

          // Verify nested file was remixed and directory structure preserved
          const nestedFilePath = join(destTmpDir, "nested/file.txt");
          assert(
            await exists(nestedFilePath),
            "nested file should exist in remixed project with directory structure preserved",
          );

          // Verify file contents were copied correctly
          const regularContent = await Deno.readTextFile(regularFilePath);
          assertEquals(
            regularContent,
            "export const hello = () => 'world';",
            "regular file content should be preserved",
          );

          const nestedContent = await Deno.readTextFile(nestedFilePath);
          assertEquals(
            nestedContent,
            "This is a nested text file",
            "nested file content should be preserved",
          );

          // Verify the project exists on Val Town
          const remixedProject = await sdk.projects.retrieve(
            result.toProjectId,
          );

          assertEquals(
            remixedProject.name,
            remixedProjectName,
            "project should exist on val town with correct name",
          );
        });

        // Clean up the remixed project
        const { id } = await sdk.alias.username.projectName.retrieve(
          user.username!,
          remixedProjectName,
        );
        await sdk.projects.delete(id);
      });
    });
  },
  sanitizeResources: false,
});
