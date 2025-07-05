import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { remix } from "~/vt/lib/remix.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import {
  branchNameToBranch,
  createValItem,
  getCurrentUser,
  getValItem,
} from "~/sdk.ts";
import sdk from "~/sdk.ts";

Deno.test({
  name: "remix preserves HTTP Val type",
  permissions: "inherit",
  async fn(t) {
    const user = await getCurrentUser();

    await doWithNewVal(async ({ val, branch }) => {
      // Create an HTTP Val in the source val
      const httpValName = "foo_http";
      await createValItem(
        val.id,
        {
          path: `${httpValName}.ts`,
          content: "export default function handler(req: Request) {\n" +
            '  return new Response("Hello from HTTP val!");\n' +
            "}",
          type: "http",
          branchId: branch.id,
        },
      );

      await doWithTempDir(async (destTmpDir) => {
        const remixedValName = `${val.name}_remixed`;

        // Remix the val
        await t.step("remix Val with HTTP val", async () => {
          const result = await remix({
            targetDir: destTmpDir,
            srcValId: val.id,
            srcBranchId: branch.id,
            valName: remixedValName,
            privacy: "public",
          });

          // Check that the result contains expected data
          assert(result.toValId, "Should return a Val ID");
          assert(result.toVersion > 0, "Should return a valid version");
          assert(
            result.fileStateChanges.created.length > 0,
            "Should have created files",
          );

          // Check that the HTTP Val exists in the remixed val
          const remixedHttpValPath = join(destTmpDir, `${httpValName}.ts`);

          assert(
            await exists(remixedHttpValPath),
            "HTTP Val file should exist in remixed val",
          );

          // Check the file content
          const content = await Deno.readTextFile(remixedHttpValPath);
          assert(
            content.includes("export default function handler(req: Request)"),
            "HTTP Val signature should be preserved",
          );

          // Verify the file type was preserved
          const toBranchId = await branchNameToBranch(result.toValId, "main");
          const remixedFile = await getValItem(
            result.toValId,
            toBranchId.id,
            result.toVersion,
            `${httpValName}.ts`,
          );

          assertEquals(
            remixedFile?.type,
            "http",
            "HTTP Val type should be preserved in remixed val",
          );
        });

        // Clean up the remixed val
        const { id } = await sdk.alias.username.valName.retrieve(
          user.username!,
          remixedValName,
        );
        await sdk.vals.delete(id);
      });
    });
  },
});

Deno.test({
  name: "remix respects privacy settings",
  permissions: "inherit",
  async fn() {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (destTmpDir) => {
        const remixedValName = `${val.name}_private`;

        // Remix as private val
        const result = await remix({
          targetDir: destTmpDir,
          srcValId: val.id,
          srcBranchId: branch.id,
          valName: remixedValName,
          privacy: "private",
        });

        // Verify the Val was created with private visibility
        const remixedVal = await sdk.vals.retrieve(result.toValId);

        assertEquals(
          remixedVal.privacy,
          "private",
          "Remixed Val should have private visibility",
        );

        // Clean up
        await sdk.vals.delete(remixedVal.id);
      });
    });
  },
});

Deno.test({
  name: "remix with custom description",
  permissions: "inherit",
  async fn() {
    await doWithNewVal(async ({ val, branch }) => {
      await doWithTempDir(async (destTmpDir) => {
        const remixedValName = `${val.name}_with_desc`;
        const customDescription =
          "This is a custom description for the remixed val";

        // Remix with custom description
        const result = await remix({
          targetDir: destTmpDir,
          srcValId: val.id,
          srcBranchId: branch.id,
          valName: remixedValName,
          description: customDescription,
          privacy: "public",
        });

        // Verify the description was set correctly
        const remixedVal = await sdk.vals.retrieve(result.toValId);

        assertEquals(
          remixedVal.description,
          customDescription,
          "remixed Val should have the custom description",
        );

        // Clean up
        await sdk.vals.delete(remixedVal.id);
      });
    });
  },
});

Deno.test({
  name: "remix basic functionality",
  permissions: "inherit",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      const user = await getCurrentUser();

      // Create a few files in the source val
      await createValItem(
        val.id,
        {
          path: "regular.ts",
          content: "export const hello = () => 'world';",
          type: "script",
          branchId: branch.id,
        },
      );

      await createValItem(
        val.id,
        {
          path: "nested/file.txt",
          content: "This is a nested text file",
          type: "file",
          branchId: branch.id,
        },
      );

      await doWithTempDir(async (destTmpDir) => {
        const remixedValName = `${val.name}_general`;

        await t.step("general remix test", async () => {
          // Perform the remix
          const result = await remix({
            targetDir: destTmpDir,
            srcValId: val.id,
            srcBranchId: branch.id,
            valName: remixedValName,
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
            "nested file should exist in remixed Val with directory structure preserved",
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

          // Verify the Val exists on Val Town
          const remixedVal = await sdk.vals.retrieve(
            result.toValId,
          );

          assertEquals(
            remixedVal.name,
            remixedValName,
            "val should exist on Val town with correct name",
          );
        });

        // Clean up the remixed val
        const { id } = await sdk.alias.username.valName.retrieve(
          user.username!,
          remixedValName,
        );
        await sdk.vals.delete(id);
      });
    });
  },
});
