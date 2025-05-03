import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import { runVtCommand, streamVtCommand } from "~/cmd/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import sdk, { getCurrentUser, randomValName } from "~/sdk.ts";
import type { ValFileType } from "~/types.ts";
import { deadline, delay } from "@std/async";

Deno.test({
  name: "clone preserves custom deno.json and .vtignore",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        const customDenoJson = '{"tasks":{"custom":"echo test"}}';
        const customVtignore = "custom_ignore_pattern";

        await t.step("set up custom config files", async () => {
          // Create custom deno.json
          await sdk.vals.files.create(
            val.id,
            {
              path: "deno.json",
              content: customDenoJson,
              branch_id: branch.id,
              type: "file" as ValFileType,
            },
          );

          // Create custom .vtignore
          await sdk.vals.files.create(
            val.id,
            {
              path: ".vtignore",
              content: customVtignore,
              branch_id: branch.id,
              type: "file" as ValFileType,
            },
          );
        });

        await t.step("clone and verify custom config files", async () => {
          const cloneDir = join(tmpDir, "config-clone");
          await runVtCommand([
            "clone",
            val.name,
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
  sanitizeResources: false,
});

Deno.test({
  name: "clone a newly created val",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        await t.step("set up the val structure", async () => {
          // Create the directory first
          await sdk.vals.files.create(
            val.id,
            {
              path: "foo",
              branch_id: branch.id,
              type: "directory",
            },
          );

          // Create empty test.js file
          await sdk.vals.files.create(
            val.id,
            {
              path: "test.js",
              content: "",
              branch_id: branch.id,
              type: "file",
            },
          );

          // Create test_inner.js with content
          await sdk.vals.files.create(
            val.id,
            {
              path: "foo/test_inner.js",
              content:
                "export function test() { return 'Hello from test_inner'; }",
              branch_id: branch.id,
              type: "file",
            },
          );
        });

        await t.step("clone the val and assert the structure", async () => {
          const cloneDir = join(tmpDir, "cloned");
          const [output] = await runVtCommand([
            "clone",
            val.name,
            cloneDir,
          ], tmpDir);
          assertStringIncludes(output, "cloned to");

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
  sanitizeResources: false,
});

Deno.test({
  name: "clone command output",
  permissions: "inherit",
  async fn(t) {
    const user = await getCurrentUser();

    await doWithTempDir(async (tmpDir) => {
      const valName = randomValName("clone_test");

      try {
        await t.step("create a new val", async () => {
          await runVtCommand([
            "create",
            valName,
            join(tmpDir, "unused_" + crypto.randomUUID()),
          ], tmpDir);
        });

        const targetDir = join(tmpDir, "test-val-dir");

        await t.step("clone the new val", async () => {
          const [output] = await runVtCommand([
            "clone",
            valName,
            targetDir,
          ], tmpDir);

          assertStringIncludes(
            output,
            `Val ${user.username!}/${valName} cloned to`,
          );

          assert(await exists(targetDir), "val directory was not created");
        });
      } finally {
        const { id } = await sdk.alias.username.valName.retrieve(
          user.username!,
          valName,
        );
        await sdk.vals.delete(id);
      }
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "clone command with inexistent val",
  permissions: "inherit",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      const [out] = await runVtCommand([
        "clone",
        "nonexistentval123456",
      ], tmpDir);

      assertStringIncludes(out, "Val not found");
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "interactive clone with no project URI",
  permissions: "inherit",
  fn: async (t) => {
    await deadline(
      doWithTempDir(async (tmpDir) => {
        await doWithNewVal(async ({ val }) => {
          // Start the clone process with no arguments
          const [outputLines, cloneChild] = streamVtCommand(["clone"], tmpDir);
          await delay(1000);

          await t.step("use interactive clone", async () => {
            // Send the val name followed by Enter
            let stdin = cloneChild.stdin.getWriter();
            await stdin.write(new TextEncoder().encode(val.name + "\n"));
            stdin.releaseLock();
            await delay(1000);

            // Then confirm that you want to get the editor files
            stdin = cloneChild.stdin.getWriter();
            await stdin.write(new TextEncoder().encode("y\n"));
            stdin.releaseLock();
            await delay(2000);

            // Process should complete
            const { code } = await cloneChild.status;

            // Check if the clone was successful
            assert(code === 0, "clone process should exit with code 0");
          });

          await t.step("check editor files were created", async () => {
            // Verify the val directory exists
            assert(
              await exists(join(tmpDir, val.name)),
              "val directory was not created",
            );

            // Verify output contains cloning confirmation
            assert(
              outputLines.some((line) => line.includes("cloned")),
              "Output should include cloning confirmation",
            );

            // Verify .vtignore exists
            assert(
              await exists(join(tmpDir, val.name, ".vtignore")),
              ".vtignore should exist",
            );

            // Verify deno.json exists
            assert(
              await exists(join(tmpDir, val.name, "deno.json")),
              "deno.json should exist",
            );
          });
        });
      }),
      5000,
    );
  },
  sanitizeResources: false,
});
