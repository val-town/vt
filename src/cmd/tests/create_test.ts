import { assert, assertEquals } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type ValTown from "@valtown/sdk";
import { dirIsEmpty } from "~/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import sdk, { getCurrentUser, randomValName } from "~/sdk.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";

Deno.test({
  name: "create val with existing directory name",
  permissions: "inherit",
  async fn(c) {
    const user = await getCurrentUser();
    const emptyDirValName = "emptyDir" + randomValName();
    const nonEmptyDirValName = "nonEmptyDir" + randomValName();
    let emptyDirVal: ValTown.Val | null = null;

    await doWithTempDir(async (tmpDir) => {
      await c.step(
        "can create val with name of empty directory",
        async () => {
          // Create an empty directory
          const emptyDirPath = join(tmpDir, emptyDirValName);
          await Deno.mkdir(emptyDirPath);

          // Should succeed with empty directory
          await runVtCommand(["create", emptyDirValName], tmpDir);
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
        "cannot create val with name of non-empty directory",
        async () => {
          // Create a non-empty directory
          const nonEmptyDirPath = join(tmpDir, nonEmptyDirValName);
          await Deno.mkdir(nonEmptyDirPath);
          await Deno.writeTextFile(join(nonEmptyDirPath, "file"), "content");

          // Verify it exists and is not empty
          assert(
            await exists(nonEmptyDirPath),
            "non-empty directory should exist",
          );
          assert(
            !await dirIsEmpty(nonEmptyDirPath),
            "directory should not be empty",
          );

          // Should fail with non-empty directory
          const [_, status] = await runVtCommand([
            "create",
            nonEmptyDirValName,
          ], tmpDir);
          assertEquals(status, 1);
        },
      );
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "new val in specific directory",
  permissions: "inherit",
  async fn(c) {
    const user = await getCurrentUser();

    const newValName = randomValName();
    let newVal: ValTown.Val | null = null;

    try {
      await doWithTempDir(async (tmpDir) => {
        await c.step("create a new val", async () => {
          await runVtCommand(["create", newValName], tmpDir);

          newVal = await sdk.alias.username.valName.retrieve(
            user.username!,
            newValName,
          );

          assertEquals(newVal.name, newValName);
          assertEquals(newVal.author.username, user.username);
        });

        await c.step("make sure the val is cloned", async () => {
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

        await c.step("make sure the val is cloned", async () => {
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
});

Deno.test({
  name: "create new val in current working directory",
  permissions: "inherit",
  async fn(c) {
    const user = await getCurrentUser();
    const newValName = randomValName();
    let newVal: ValTown.Val | null = null;

    try {
      await doWithTempDir(async (tmpDir) => {
        await c.step("create a new val in current directory", async () => {
          await runVtCommand([
            "create",
            newValName,
          ], tmpDir);

          newVal = await sdk.alias.username.valName.retrieve(
            user.username!,
            newValName,
          );

          assertEquals(newVal.name, newValName);
          assertEquals(newVal.author.username, user.username);
        });

        await c.step(
          "make sure the val is cloned to current directory",
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
