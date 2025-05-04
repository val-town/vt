import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import {
  runVtCommand,
  streamVtCommand,
  waitForStable,
} from "~/cmd/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import sdk, { getCurrentUser, randomValName } from "~/sdk.ts";
import type { ValFileType } from "~/types.ts";

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

          const denoJsonContent = await Deno.readTextFile(
            join(cloneDir, "deno.json"),
          );
          assertEquals(
            denoJsonContent,
            customDenoJson,
            "custom deno.json should be preserved",
          );

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
        await t.step("set up the Val structure", async () => {
          await sdk.vals.files.create(
            val.id,
            {
              path: "foo",
              branch_id: branch.id,
              type: "directory",
            },
          );

          await sdk.vals.files.create(
            val.id,
            {
              path: "test.js",
              content: "",
              branch_id: branch.id,
              type: "file",
            },
          );

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

        await t.step("clone the Val and assert the structure", async () => {
          const cloneDir = join(tmpDir, "cloned");
          const [output] = await runVtCommand([
            "clone",
            val.name,
            cloneDir,
            "--no-editor-files",
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
            "--no-editor-files",
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
        randomValName(),
        "--no-editor-files",
      ], tmpDir);

      assertStringIncludes(out, "Val not found");
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "interactive clone with no Val URI",
  permissions: "inherit",
  fn: async (t) => {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val }) => {
        const fullPath = join(tmpDir, val.name);

        const [outputLines, cloneChild] = streamVtCommand(["clone"], tmpDir);
        await waitForStable(outputLines);

        await t.step("use interactive clone", async () => {
          let stdin = cloneChild.stdin.getWriter();
          await stdin.write(new TextEncoder().encode(val.name + "\n"));
          stdin.releaseLock();
          await waitForStable(outputLines);

          stdin = cloneChild.stdin.getWriter();
          await stdin.write(new TextEncoder().encode("y\n"));
          await waitForStable(outputLines);
          stdin.abort();
        });
        await t.step("check editor files were created", async () => {
          assert(
            await exists(fullPath),
            "val directory was not created",
          );
          assertMatch(
            outputLines.join("\n"),
            /Val .+\/[^ ]+ cloned to "[^"]+"/,
          );

          // Verify that the editor files got created (we asked for them)
          assert(
            await exists(join(tmpDir, val.name, ".vtignore")),
            ".vtignore should exist",
          );
          assert(
            await exists(join(tmpDir, val.name, "deno.json")),
            "deno.json should exist",
          );
        });
      });
    });
  },
  sanitizeResources: false,
});
