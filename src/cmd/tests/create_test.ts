import {
  assert,
  assertEquals,
  AssertionError,
  assertStringIncludes,
} from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type ValTown from "@valtown/sdk";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import sdk, {
  branchNameToBranch,
  getCurrentUser,
  getLatestVersion,
  listValItems,
  randomValName,
} from "~/sdk.ts";
import { runVtCommand, streamVtCommand } from "~/cmd/tests/utils.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { delay } from "@std/async";

Deno.test({
  name: "create Val with existing directory name",
  permissions: "inherit",
  async fn(c) {
    const user = await getCurrentUser();
    const emptyDirValName = "emptyDir" + randomValName();
    const nonEmptyDirValName = "nonEmptyDir" + randomValName();
    let emptyDirVal: ValTown.Val | null = null;

    await doWithTempDir(async (tmpDir) => {
      await c.step(
        "can create Val with name of empty directory",
        async () => {
          // Create an empty directory
          const emptyDirPath = join(tmpDir, emptyDirValName);
          await Deno.mkdir(emptyDirPath);

          // Should succeed with empty directory
          await runVtCommand(
            ["create", emptyDirValName, "--org-name", "me"],
            tmpDir,
          );
          emptyDirVal = await sdk.alias.username.valName.retrieve(
            user.username!,
            emptyDirValName,
          );

          assertEquals(emptyDirVal.name, emptyDirValName);

          // Clean up
          if (emptyDirVal) {
            await sdk.vals.delete(emptyDirVal.id);
            emptyDirVal = null;
          }
        },
      );

      await c.step(
        "cannot create Val with name of non-empty directory without confirmation",
        async () => {
          // Create a non-empty directory
          const nonEmptyDirPath = join(tmpDir, nonEmptyDirValName);
          await Deno.mkdir(nonEmptyDirPath);
          await Deno.writeTextFile(join(nonEmptyDirPath, "file"), "content");

          const [stdout, _] = await runVtCommand([
            "create",
            nonEmptyDirValName,
            "--org-name",
            "me",
          ], tmpDir);
          assertStringIncludes(
            stdout,
            "files will be uploaded",
          );
        },
      );
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "new Val in specific directory",
  permissions: "inherit",
  async fn(c) {
    const user = await getCurrentUser();

    const newValName = randomValName();
    let newVal: ValTown.Val | null = null;

    try {
      await doWithTempDir(async (tmpDir) => {
        await c.step("create a new val", async () => {
          await runVtCommand(
            ["create", newValName, "--org-name", "me"],
            tmpDir,
          );

          newVal = await sdk.alias.username.valName.retrieve(
            user.username!,
            newValName,
          );

          assertEquals(newVal.name, newValName);
          assertEquals(newVal.author.username, user.username);
        });

        await c.step("make sure the Val is cloned", async () => {
          assert(
            await exists(join(tmpDir, newValName)),
            "val was not cloned to target",
          );
        });
      });
    } finally {
      // @ts-ignore newVal is defined but something went wrong
      await sdk.vals.delete(newVal.id);
    }
  },
  sanitizeResources: false,
});

Deno.test({
  name: "create new private val",
  permissions: "inherit",
  async fn(c) {
    const user = await getCurrentUser();
    const newValName = randomValName();
    let newVal: ValTown.Val | null = null;

    try {
      await doWithTempDir(async (tmpDir) => {
        await c.step("create a new private val", async () => {
          await runVtCommand([
            "create",
            newValName,
            "--private",
            "--org-name",
            "me",
          ], tmpDir);

          newVal = await sdk.alias.username.valName.retrieve(
            user.username!,
            newValName,
          );

          assertEquals(newVal.name, newValName);
          assertEquals(newVal.author.username, user.username);
          assertEquals(
            newVal.privacy,
            "private",
            "val should be private",
          );
        });

        await c.step("make sure the Val is cloned", async () => {
          assert(
            await exists(join(tmpDir, newValName)),
            "val was not cloned to target",
          );
        });
      });
    } finally {
      // @ts-ignore newVal is defined but something went wrong
      if (newVal) await sdk.vals.delete(newVal.id);
    }
  },
  sanitizeResources: false,
});

Deno.test({
  name: "create new Val in current working directory",
  permissions: "inherit",
  async fn(c) {
    const user = await getCurrentUser();
    const newValName = randomValName();
    let newVal: ValTown.Val | null = null;

    try {
      await doWithTempDir(async (tmpDir) => {
        await c.step("create a new Val in current directory", async () => {
          await runVtCommand([
            "create",
            newValName,
            "--org-name",
            "me",
          ], tmpDir);

          newVal = await sdk.alias.username.valName.retrieve(
            user.username!,
            newValName,
          );

          assertEquals(newVal.name, newValName);
          assertEquals(newVal.author.username, user.username);
        });

        await c.step(
          "make sure the Val is cloned to current directory",
          async () => {
            assert(
              await exists(join(tmpDir, newValName)),
              "val was not cloned to current directory",
            );
          },
        );
      });
    } finally {
      // @ts-ignore newVal is defined but something went wrong
      if (newVal) await sdk.vals.delete(newVal.id);
    }
  },
  sanitizeResources: false,
});

Deno.test({
  name: "create Val in current directory with existing files",
  permissions: "inherit",
  async fn(t) {
    const user = await getCurrentUser();
    const newValName = randomValName();
    let newVal: ValTown.Val | null = null;

    await doWithTempDir(async (tmpDir) => {
      await t.step("create files in current directory", async () => {
        // Create some files in the temp directory
        await Deno.writeTextFile(
          join(tmpDir, "existing-file.js"),
          "console.log('Existing file content');",
        );
        await Deno.writeTextFile(
          join(tmpDir, "another-file.ts"),
          "export const value = 42;",
        );
        await Deno.mkdir(join(tmpDir, "foo"));
        await Deno.writeTextFile(
          join(tmpDir, "foo/.vtignore"),
          "ignored-file.txt",
        );
        await Deno.writeTextFile(
          join(tmpDir, "ignored-file.txt"),
          "This file should not be uploaded",
        );
      });

      await t.step("create Val in current directory", async () => {
        // Create Val in current directory using "."
        const [_stdout, code] = await runVtCommand([
          "create",
          newValName,
          ".",
          "--upload-if-exists",
          "--no-editor-files",
          "--org-name",
          "me",
        ], tmpDir);
        assertEquals(code, 0);

        newVal = await sdk.alias.username.valName.retrieve(
          user.username!,
          newValName,
        );

        assertEquals(newVal.name, newValName);
        assertEquals(newVal.author.username, user.username);
      });

      await t.step("verify files were uploaded to the Val", async () => {
        // Check that the files exist in the Val
        const valItems = await listValItems(
          newVal!.id,
          (await branchNameToBranch(newVal!.id, DEFAULT_BRANCH_NAME)).id,
          await getLatestVersion(
            newVal!.id,
            (await branchNameToBranch(newVal!.id, DEFAULT_BRANCH_NAME)).id,
          ),
        );

        const fileNames = valItems.map((item) => item.path);
        assert(
          fileNames.includes("existing-file.js"),
          "existing-file.js should be uploaded to Val",
        );
        assert(
          fileNames.includes("another-file.ts"),
          "another-file.ts should be uploaded to Val",
        );
        assert(
          !fileNames.includes("ignored-file.txt"),
          "ignored-file.txt should be ignored and not uploaded to Val",
        );
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "Get prompted for org to create Val in",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await t.step("Create Val without --org-name", async () => {
        const newValName = randomValName();
        const [stdout, _proc] = streamVtCommand(
          ["create", newValName],
          tmpDir,
        );

        for (let i = 0; i < 100; i++) { // wait a bit to get prompt data
          if (stdout.join("\n").includes("organization you are a")) return;
          await delay(50);
        }

        throw new AssertionError("Was never prompted for org to create Val in");
      });
    });
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "create Val in org using orgName/valName format",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ org }) => {
        const newValName = randomValName();
        let newVal: ValTown.Val | null = null;

        await t.step(
          "create a new val in org using orgName/valName",
          async () => {
            await runVtCommand(
              ["create", `${org.handle}/${newValName}`],
              tmpDir,
            );

            newVal = await sdk.alias.username.valName.retrieve(
              org.handle,
              newValName,
            );

            assertEquals(newVal.name, newValName);
            assertEquals(newVal.author.username, org.handle);
          },
        );

        await t.step("make sure the Val is cloned", async () => {
          assert(
            await exists(join(tmpDir, newValName)),
            "val was not cloned to target",
          );
        });
      }, { inOrg: true });
    });
  },
  sanitizeResources: false,
});
