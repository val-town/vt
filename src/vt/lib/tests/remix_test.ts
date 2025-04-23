import { doWithTempDir } from "~/vt/lib/utils.ts";
import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
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
    await doWithNewVal(async ({ val }) => {
      // Create an HTTP val in the source val
      const httpValName = "foo_http";
      await sdk.vals.files.create(
        val.id,
        {
          path: `${httpValName}.ts`,
          content: "export default function handler(req: Request) {\n" +
            '  return new Response("Hello from HTTP val!");\n' +
            "}",
          type: "http",
        },
      );

      await doWithTempDir(async (destTmpDir) => {
        const remixedvalName = `${val.name}_remixed`;

        // Remix the val
        await t.step("remix val with HTTP val", async () => {
          const result = await remix({
            targetDir: destTmpDir,
            srcValId: val.id,
            srcBranchId: "main",
            valName: remixedvalName,
            privacy: "public",
          });

          // Check that the result contains expected data
          assert(result.toValId, "Should return a val ID");
          assert(result.toVersion > 0, "Should return a valid version");
          assert(
            result.fileStateChanges.created.length > 0,
            "Should have created files",
          );

          // Check that the HTTP val exists in the remixed val
          const remixedHttpValPath = join(destTmpDir, `${httpValName}.ts`);

          assert(
            await exists(remixedHttpValPath),
            "HTTP val file should exist in remixed val",
          );

          // Check the file content
          const content = await Deno.readTextFile(remixedHttpValPath);
          assert(
            content.includes("export default function handler(req: Request)"),
            "HTTP val signature should be preserved",
          );

          // Verify the file type was preserved
          const remixedFile = await sdk.vals.files.retrieve(
            result.toValId,
            { path: `${httpValName}.ts`, recursive: true },
          ).then((resp) => resp.data[0]);

          assertEquals(
            remixedFile.type,
            "http",
            "HTTP val type should be preserved in remixed val",
          );
        });

        // Clean up the remixed val
        const { id } = await sdk.alias.username.valName.retrieve(
          user.username!,
          remixedvalName,
        );
        await sdk.vals.delete(id);
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
    await doWithNewVal(async ({ val }) => {
      await doWithTempDir(async (destTmpDir) => {
        const remixedvalName = `${val.name}_private`;

        // Remix as private val
        const result = await remix({
          targetDir: destTmpDir,
          srcValId: val.id,
          srcBranchId: "main",
          valName: remixedvalName,
          privacy: "private",
        });

        // Verify the val was created with private visibility
        const remixedval = await sdk.vals.retrieve(result.toValId);

        assertEquals(
          remixedval.privacy,
          "private",
          "Remixed val should have private visibility",
        );

        // Clean up
        await sdk.vals.delete(remixedval.id);
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
    await doWithNewVal(async ({ val }) => {
      await doWithTempDir(async (destTmpDir) => {
        const remixedvalName = `${val.name}_with_desc`;
        const customDescription =
          "This is a custom description for the remixed val";

        // Remix with custom description
        const result = await remix({
          targetDir: destTmpDir,
          srcValId: val.id,
          srcBranchId: "main",
          valName: remixedvalName,
          description: customDescription,
          privacy: "public",
        });

        // Verify the description was set correctly
        const remixedval = await sdk.vals.retrieve(result.toValId);

        assertEquals(
          remixedval.description,
          customDescription,
          "remixed val should have the custom description",
        );

        // Clean up
        await sdk.vals.delete(remixedval.id);
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
    await doWithNewVal(async ({ val }) => {
      // Create a few files in the source val
      await sdk.vals.files.create(
        val.id,
        {
          path: "regular.ts",
          content: "export const hello = () => 'world';",
          type: "script",
        },
      );

      await sdk.vals.files.create(
        val.id,
        {
          path: "nested/file.txt",
          content: "This is a nested text file",
          type: "file",
        },
      );

      await doWithTempDir(async (destTmpDir) => {
        const remixedvalName = `${val.name}_general`;

        await t.step("general remix test", async () => {
          // Perform the remix
          const result = await remix({
            targetDir: destTmpDir,
            srcValId: val.id,
            srcBranchId: "main",
            valName: remixedvalName,
            privacy: "public",
          });

          // Verify regular file was remixed
          const regularFilePath = join(destTmpDir, "regular.ts");
          assert(
            await exists(regularFilePath),
            "regular file should exist in remixed val",
          );

          // Verify nested file was remixed and directory structure preserved
          const nestedFilePath = join(destTmpDir, "nested/file.txt");
          assert(
            await exists(nestedFilePath),
            "nested file should exist in remixed val with directory structure preserved",
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

          // Verify the val exists on Val Town
          const remixedval = await sdk.vals.retrieve(
            result.toValId,
          );

          assertEquals(
            remixedval.name,
            remixedvalName,
            "val should exist on val town with correct name",
          );
        });

        // Clean up the remixed val
        const { id } = await sdk.alias.username.valName.retrieve(
          user.username!,
          remixedvalName,
        );
        await sdk.vals.delete(id);
      });
    });
  },
  sanitizeResources: false,
});
