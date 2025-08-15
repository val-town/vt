import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type ValTown from "@valtown/sdk";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import sdk, {
  branchNameToBranch,
  getCurrentUser,
  getLatestVersion,
  listValItems,
  randomValName,
} from "~/sdk.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";

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
        "cannot create Val with name of non-empty directory without confirmation",
        async () => {
          // Create a non-empty directory
          const nonEmptyDirPath = join(tmpDir, nonEmptyDirValName);
          await Deno.mkdir(nonEmptyDirPath);
          await Deno.writeTextFile(join(nonEmptyDirPath, "file"), "content");

          const [stdout, _] = await runVtCommand([
            "create",
            nonEmptyDirValName,
          ], tmpDir);
          console.log(stdout);
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
          await runVtCommand(["create", newValName], tmpDir);

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
      });

      await t.step("create Val in current directory", async () => {
        // Create Val in current directory using "."
        await runVtCommand([
          "create",
          newValName,
          ".",
          "--upload-if-exists",
          "--no-editor-files",
        ], tmpDir);

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
      });
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "create Val with --if-exists continue option",
  permissions: "inherit",
  async fn(t) {
    const user = await getCurrentUser();
    const newValName = randomValName();
    let newVal: ValTown.Val | null = null;

    await doWithTempDir(async (tmpDir) => {
      await t.step("create files in target directory", async () => {
        const targetDir = join(tmpDir, newValName);
        await Deno.mkdir(targetDir);

        // Create some files in the target directory
        await Deno.writeTextFile(
          join(targetDir, "existing-file.js"),
          "console.log('Existing file content');",
        );
        await Deno.writeTextFile(
          join(targetDir, "another-file.ts"),
          "export const value = 42;",
        );
      });

      await t.step("create Val with --if-exists continue", async () => {
        // Create Val with --if-exists continue option
        await runVtCommand([
          "create",
          newValName,
          "--if-exists",
          "continue",
          "--no-editor-files",
        ], tmpDir);

        newVal = await sdk.alias.username.valName.retrieve(
          user.username!,
          newValName,
        );

        assertEquals(newVal.name, newValName);
        assertEquals(newVal.author.username, user.username);
      });

      await t.step("verify files were NOT uploaded to the Val", async () => {
        // Check that the existing files were NOT uploaded to the Val
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
          !fileNames.includes("existing-file.js"),
          "existing-file.js should NOT be uploaded to Val with continue option",
        );
        assert(
          !fileNames.includes("another-file.ts"),
          "another-file.ts should NOT be uploaded to Val with continue option",
        );
      });

      await t.step("verify local files still exist", async () => {
        // Verify the local files still exist in the directory
        const targetDir = join(tmpDir, newValName);
        assert(
          await exists(join(targetDir, "existing-file.js")),
          "existing-file.js should still exist locally",
        );
        assert(
          await exists(join(targetDir, "another-file.ts")),
          "another-file.ts should still exist locally",
        );
      });
    });
  },
  sanitizeResources: false,
});
