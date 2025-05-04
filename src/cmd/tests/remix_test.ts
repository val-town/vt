import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { join } from "@std/path";
import sdk, { getCurrentUser } from "~/sdk.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { assert, assertMatch, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";
import { META_FOLDER_NAME } from "~/consts.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";

Deno.test({
  name: "remix command from current directory",
  async fn(t) {
    const user = await getCurrentUser();

    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        const fullPath = join(tmpDir, val.name);

        // Clone the source project to the temp dir
        await runVtCommand([
          "clone",
          `${user.username}/${val.name}`,
        ], tmpDir);

        await t.step("remix from current directory", async () => {
          const [output] = await runVtCommand(["remix"], fullPath);

          // Check that the output contains the expected pattern
            assertMatch(
            output,
            new RegExp(
              `Remixed current Val to public Val "@${user
              .username!}/[\\w_]+"`,
            ),
            );

          // Extract the actual remixed project name from the output
          const remixPattern = new RegExp(`@${user.username}/([\\w_]+)`);
          const match = output.match(remixPattern);
          assert(
            match && match[1],
            "could not extract remixed Val name from output",
          );

          const actualRemixedProjectName = match[1];

          // Clean up the remixed project
          const { id } = await sdk.alias.username.valName.retrieve(
            user.username!,
            actualRemixedProjectName,
          );
          await sdk.vals.delete(id);
        });
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "remix a specific project uri",
  async fn(t) {
    const user = await getCurrentUser();

    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        // Create a source Val to remix
        const sourceValName = val.name;
        const remixedValName = `${sourceValName}_remixed`;

        await t.step("remix the val", async () => {
          const [output] = await runVtCommand([
            "remix",
            `${user.username}/${sourceValName}`,
            remixedValName,
            "--no-editor-files",
          ], tmpDir);

          assertStringIncludes(
            output,
            `Remixed "@${user.username}/${sourceValName}" to public Val "@${user.username}/${remixedValName}"`,
          );

          // Verify the remixed Val directory exists
          const remixedValPath = join(tmpDir, remixedValName);
          assert(
            await exists(remixedValPath),
            "remixed Val directory should exist",
          );

          // Verify it has the .vt metadata folder
          assert(
            await exists(join(remixedValPath, META_FOLDER_NAME)),
            "remixed Val should have .vt metadata folder",
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
  sanitizeResources: false,
});

Deno.test({
  name: "remix command with privacy options",
  permissions: "inherit",
  async fn(t) {
    const user = await getCurrentUser();

    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        const sourceValName = val.name;

        await t.step("remix as private val", async () => {
          const privateValName = `${sourceValName}_private`;
          const [output] = await runVtCommand([
            "remix",
            `${user.username}/${sourceValName}`,
            privateValName,
            "--private",
            "--no-editor-files",
          ], tmpDir);

          assertStringIncludes(
            output,
            `to private Val`,
            "output should indicate private Val",
          );

          const { id } = await sdk.alias.username.valName.retrieve(
            user.username!,
            privateValName,
          );
          await sdk.vals.delete(id);
        });

        await t.step("remix as unlisted Val", async () => {
          const unlistedValName = `${sourceValName}_unlisted`;
          const [output] = await runVtCommand([
            "remix",
            `${user.username}/${sourceValName}`,
            unlistedValName,
            "--unlisted",
            "--no-editor-files",
          ], tmpDir);

          assertStringIncludes(
            output,
            `to unlisted Val`,
            "output should indicate unlisted Val",
          );

          const { id } = await sdk.alias.username.valName.retrieve(
            user.username!,
            unlistedValName,
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
  permissions: "inherit",
  async fn(t) {
    const user = await getCurrentUser();

    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        const sourceValName = val.name;
        const remixedValName = `${sourceValName}_no_editor_files`;

        await t.step("remix without editor files", async () => {
          await runVtCommand([
            "remix",
            `${user.username}/${sourceValName}`,
            remixedValName,
            "--no-editor-files",
          ], tmpDir);

          const remixedValPath = join(tmpDir, remixedValName);

          // Check that editor files don't exist
          assert(
            !(await exists(join(remixedValPath, ".vscode"))),
            ".vscode directory should not exist",
          );

          const { id } = await sdk.alias.username.valName.retrieve(
            user.username!,
            remixedValName,
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
  permissions: "inherit",
  async fn(t) {
    const user = await getCurrentUser();

    // Create a temp dir for the source val
    await doWithTempDir(async (srcTmpDir) => {
      // Create a temp dir for the remix destination
      await doWithTempDir(async (destTmpDir) => {
        await doWithNewVal(async ({ val }) => {
          const sourceValName = val.name;
          const remixedValName = `${sourceValName}_http_preserved`;

          // Clone the Val to the source directory
          await runVtCommand([
            "clone",
            `${user.username}/${sourceValName}`,
            srcTmpDir,
            "--no-editor-files",
          ], ".");

          // Create an HTTP Val in the source val
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
          await t.step("remix Val with HTTP val", async () => {
            await runVtCommand([
              "remix",
              `${user.username}/${sourceValName}`,
              remixedValName,
              "--no-editor-files",
            ], destTmpDir);

            // Check that the HTTP Val exists in the remixed val
            const remixedValPath = join(destTmpDir, remixedValName);
            const remixedHttpValPath = join(
              remixedValPath,
              `${httpValName}.ts`,
            );

            assert(
              await exists(remixedHttpValPath),
              "HTTP Val file should exist in remixed Val",
            );

            // Check the file content to ensure it's still an HTTP val
            const content = await Deno.readTextFile(remixedHttpValPath);
            assertStringIncludes(
              content,
              "export default function handler(req: Request)",
              "HTTP Val signature should be preserved",
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
    });
  },
  sanitizeResources: false,
});
