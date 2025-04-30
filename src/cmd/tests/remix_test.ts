import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { join } from "@std/path";
import sdk, { getCurrentUser } from "~/sdk.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assert, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";
import { META_FOLDER_NAME } from "~/consts.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";

Deno.test({
  name: "remix command basic functionality",
  async fn(t) {
    const user = await getCurrentUser();

    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        // Create a source val to remix
        const sourcevalName = val.name;
        const remixedvalName = `${sourcevalName}_remixed`;

        await t.step("remix the val", async () => {
          const [output] = await runVtCommand([
            "remix",
            `${user.username}/${sourcevalName}`,
            remixedvalName,
          ], tmpDir);

          assertStringIncludes(
            output,
            `Remixed "@${user.username}/${sourcevalName}" to public val "@${user.username}/${remixedvalName}"`,
          );

          // Verify the remixed val directory exists
          const remixedvalPath = join(tmpDir, remixedvalName);
          assert(
            await exists(remixedvalPath),
            "remixed val directory should exist",
          );

          // Verify it has the .vt metadata folder
          assert(
            await exists(join(remixedvalPath, META_FOLDER_NAME)),
            "remixed val should have .vt metadata folder",
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
  name: "remix command with privacy options",
  async fn(t) {
    const user = await getCurrentUser();

    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        const sourcevalName = val.name;

        await t.step("remix as private val", async () => {
          const privatevalName = `${sourcevalName}_private`;
          const [output] = await runVtCommand([
            "remix",
            `${user.username}/${sourcevalName}`,
            privatevalName,
            "--private",
            "--no-editor-files",
          ], tmpDir);

          assertStringIncludes(
            output,
            `to private val`,
            "output should indicate private val",
          );

          // Clean up
          try {
            const { id } = await sdk.alias.username.valName.retrieve(
              user.username!,
              privatevalName,
            );
            await sdk.vals.delete(id);
          } catch (e) {
            console.error("Failed to clean up private val:", e);
          }
        });

        await t.step("remix as unlisted val", async () => {
          const unlistedvalName = `${sourcevalName}_unlisted`;
          const [output] = await runVtCommand([
            "remix",
            `${user.username}/${sourcevalName}`,
            unlistedvalName,
            "--unlisted",
            "--no-editor-files",
          ], tmpDir);

          assertStringIncludes(
            output,
            `to unlisted val`,
            "output should indicate unlisted val",
          );

          const { id } = await sdk.alias.username.valName.retrieve(
            user.username!,
            unlistedvalName,
          );
          await sdk.vals.delete(id);
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "remix command with no-editor-files option",
  async fn(t) {
    const user = await getCurrentUser();

    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        const sourcevalName = val.name;
        const remixedvalName = `${sourcevalName}_no_editor_files`;

        await t.step("remix without editor files", async () => {
          await runVtCommand([
            "remix",
            `${user.username}/${sourcevalName}`,
            remixedvalName,
            "--no-editor-files",
          ], tmpDir);

          const remixedvalPath = join(tmpDir, remixedvalName);

          // Check that editor files don't exist
          assert(
            !(await exists(join(remixedvalPath, ".vscode"))),
            ".vscode directory should not exist",
          );

          const { id } = await sdk.alias.username.valName.retrieve(
            user.username!,
            remixedvalName,
          );
          await sdk.vals.delete(id);
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "remix command preserves HTTP type",
  async fn(t) {
    const user = await getCurrentUser();

    // Create a temp dir for the source val
    await doWithTempDir(async (srcTmpDir) => {
      // Create a temp dir for the remix destination
      await doWithTempDir(async (destTmpDir) => {
        await doWithNewVal(async ({ val }) => {
          const sourcevalName = val.name;
          const remixedvalName = `${sourcevalName}_http_preserved`;

          // Clone the val to the source directory
          await runVtCommand([
            "clone",
            `${user.username}/${sourcevalName}`,
            srcTmpDir,
            "--no-editor-files",
          ], ".");

          // Create an HTTP val in the source val
          const httpValName = "foo_http";
          const httpValPath = join(srcTmpDir, `${httpValName}.ts`);

          await Deno.writeTextFile(
            httpValPath,
            "export default function handler(req: Request) {\n" +
              '  return new Response("Hello from HTTP val!");\n' +
              "}",
          );

          // Push the changes to sync the HTTP val
          await runVtCommand(["push"], srcTmpDir, { autoConfirm: true });

          // Remix the val
          await t.step("remix val with HTTP val", async () => {
            await runVtCommand([
              "remix",
              `${user.username}/${sourcevalName}`,
              remixedvalName,
              "--no-editor-files",
            ], destTmpDir);

            // Check that the HTTP val exists in the remixed val
            const remixedvalPath = join(destTmpDir, remixedvalName);
            const remixedHttpValPath = join(
              remixedvalPath,
              `${httpValName}.ts`,
            );

            assert(
              await exists(remixedHttpValPath),
              "HTTP val file should exist in remixed val",
            );

            // Check the file content to ensure it's still an HTTP val
            const content = await Deno.readTextFile(remixedHttpValPath);
            assertStringIncludes(
              content,
              "export default function handler(req: Request)",
              "HTTP val signature should be preserved",
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
    });
  },
  sanitizeResources: false,
});
