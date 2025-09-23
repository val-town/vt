import { assert, assertEquals, assertFalse, assertRejects } from "@std/assert";
import { canWriteToVal } from "./sdk.ts";
import { assertPathEquals, doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { join } from "@std/path";

import {
  branchExists,
  branchNameToBranch,
  createNewBranch,
  createNewVal,
  createValItem,
  deleteValItem,
  getCurrentUser,
  getLatestVersion,
  getValItem,
  getValItemContent,
  listValItems,
  randomValName,
  updateValFile,
  valExists,
  valItemExists,
} from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { asPosixPath } from "./utils.ts";

Deno.test({
  name: "Checking if we can write to Vals",
  permissions: "inherit",
  async fn() {
    const VAL_WE_CANT_WRITE_TO = "b037fb4a-791b-11f0-b97e-0224a6c84d84";

    await doWithNewVal(async ({ val }) => {
      assert(await canWriteToVal(val.id));
      assertFalse(await canWriteToVal(VAL_WE_CANT_WRITE_TO));
    });
  },
  sanitizeResources: false,
});

Deno.test({
  name: "test valExists function",
  async fn(t) {
    await doWithNewVal(async ({ val }) => {
      await t.step("check existing val by ID", async () => {
        const exists = await valExists(val.id);
        assert(exists, "Val should exist when checked by ID");
      });

      await t.step("check non-existent val by ID", async () => {
        const exists = await valExists(crypto.randomUUID());
        assert(!exists, "Non-existent val should not exist");
      });

      await t.step("check existing val by username and name", async () => {
        const user = await getCurrentUser();
        if (user.username) {
          const exists = await valExists({
            username: user.username,
            valName: val.name,
          });
          assert(exists, "Val should exist when checked by username and name");
        }
      });

      await t.step("check non-existent val by username and name", async () => {
        const user = await getCurrentUser();
        if (user.username) {
          const exists = await valExists({
            username: user.username,
            valName: "non-existent-val-name",
          });
          assert(!exists, "Non-existent val should not exist");
        }
      });
    });
  },
});

Deno.test({
  name: "test branch management functions",
  async fn(t) {
    await doWithNewVal(async ({ val, branch: mainBranch }) => {
      await t.step("check existing branch", async () => {
        const exists = await branchExists(val.id, DEFAULT_BRANCH_NAME);
        assert(exists, "Main branch should exist");
      });

      await t.step("check non-existent branch", async () => {
        const exists = await branchExists(val.id, "non-existent-branch");
        assert(!exists, "Non-existent branch should not exist");
      });

      await t.step("get branch by name", async () => {
        const branch = await branchNameToBranch(val.id, DEFAULT_BRANCH_NAME);
        assertEquals(branch.id, mainBranch.id, "Should return correct branch");
        assertEquals(
          branch.name,
          DEFAULT_BRANCH_NAME,
          "Should have correct name",
        );
      });

      await t.step("fail to get non-existent branch", async () => {
        await assertRejects(
          () => branchNameToBranch(val.id, "non-existent-branch"),
          Deno.errors.NotFound,
          'Branch "non-existent-branch" not found in Val',
        );
      });

      await t.step("create new branch", async () => {
        const newBranch = await createNewBranch(val.id, {
          name: "test-branch",
          branchId: mainBranch.id,
        });

        assertEquals(newBranch.name, "test-branch", "Should have correct name");

        // Verify branch exists
        const exists = await branchExists(val.id, "test-branch");
        assert(exists, "New branch should exist");
      });

      await t.step("get latest version", async () => {
        const version = await getLatestVersion(val.id, mainBranch.id);
        assert(typeof version === "number", "Version should be a number");
        assert(version === 0, `Version should be at least 1, got ${version}`);

        // Create a new file to bump version
        await createValItem(val.id, {
          path: "bump-version.txt",
          content: "Bump version",
          branchId: mainBranch.id,
          type: "file",
        });

        const newVersion = await getLatestVersion(val.id, mainBranch.id);
        assert(
          newVersion === version + 1,
          `Version should increment by 1, got ${newVersion}`,
        );
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});

Deno.test({
  name: "test val item management functions",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      const testFilePath = "test-file.txt";
      const testContent = "Hello, World!";

      await t.step("create val item", async () => {
        const result = await createValItem(val.id, {
          path: testFilePath,
          content: testContent,
          branchId: branch.id,
          type: "file",
        });

        assert(result.id, "Created item should have an ID");
        assertEquals(result.path, testFilePath, "Should have correct path");
        assertEquals(result.type, "file", "Should have correct type");
      });

      await t.step("check val item exists", async () => {
        const version = await getLatestVersion(val.id, branch.id);
        const exists = await valItemExists(
          val.id,
          branch.id,
          testFilePath,
          version,
        );
        assert(exists, "Created file should exist");
      });

      await t.step("get val item", async () => {
        const version = await getLatestVersion(val.id, branch.id);
        const item = await getValItem(val.id, branch.id, version, testFilePath);

        assert(item, "Should return the item");
        assertEquals(item.path, testFilePath, "Should have correct path");
        assertEquals(item.type, "file", "Should have correct type");
      });

      await t.step("get val item content", async () => {
        const version = await getLatestVersion(val.id, branch.id);
        const content = await getValItemContent(
          val.id,
          branch.id,
          version,
          testFilePath,
        );
        assertEquals(content, testContent, "Should return correct content");
      });

      await t.step("list val items", async () => {
        const version = await getLatestVersion(val.id, branch.id);
        const items = await listValItems(val.id, branch.id, version);

        assert(Array.isArray(items), "Should return an array");
        assert(items.length > 0, "Should contain at least one item");

        const testFile = items.find((item) => item.path === testFilePath);
        assert(testFile, "Should contain our test file");
      });

      await t.step("update val file", async () => {
        const newContent = "Updated content";
        const result = await updateValFile(val.id, {
          path: testFilePath,
          branchId: branch.id,
          content: newContent,
        });

        assert(result.id, "Updated item should have an ID");

        // Verify content was updated
        const version = await getLatestVersion(val.id, branch.id);
        const content = await getValItemContent(
          val.id,
          branch.id,
          version,
          testFilePath,
        );
        assertEquals(content, newContent, "Content should be updated");
      });

      await t.step("delete val item", async () => {
        await deleteValItem(val.id, {
          path: testFilePath,
          branchId: branch.id,
        });

        // Verify file was deleted
        const version = await getLatestVersion(val.id, branch.id);
        const exists = await valItemExists(
          val.id,
          branch.id,
          testFilePath,
          version,
        );
        assert(!exists, "File should be deleted");
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});

Deno.test({
  name: "test directory operations",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      const dirPath = "test-dir";
      const filePath = join(dirPath, "nested-file.txt");

      await t.step("create directory", async () => {
        const result = await createValItem(val.id, {
          path: dirPath,
          branchId: branch.id,
          type: "directory",
        });

        assertEquals(result.type, "directory", "Should be a directory");
        assertPathEquals(result.path, dirPath, "Should have correct path");
      });

      await t.step("create file in directory", async () => {
        const result = await createValItem(val.id, {
          path: filePath,
          content: "nested content",
          branchId: branch.id,
          type: "file",
        });

        assertPathEquals(
          result.path,
          filePath,
          "Should have correct nested path",
        );
      });

      await t.step("list items includes directory and file", async () => {
        const version = await getLatestVersion(val.id, branch.id);
        const items = await listValItems(val.id, branch.id, version);

        const directory = items.find((item) =>
          asPosixPath(item.path) === asPosixPath(dirPath)
        );
        const file = items.find((item) =>
          asPosixPath(item.path) === asPosixPath(filePath)
        );

        assert(directory, "Should contain directory");
        assert(file, "Should contain nested file");
        assertEquals(
          directory.type,
          "directory",
          "Directory should have correct type",
        );
        assertEquals(file.type, "file", "File should have correct type");
      });

      await t.step("delete directory recursively", async () => {
        await deleteValItem(val.id, {
          path: dirPath,
          branchId: branch.id,
          recursive: true,
        });

        // Verify both directory and file are deleted
        const version = await getLatestVersion(val.id, branch.id);
        const dirExists = await valItemExists(
          val.id,
          branch.id,
          dirPath,
          version,
        );
        const fileExists = await valItemExists(
          val.id,
          branch.id,
          filePath,
          version,
        );

        assert(!dirExists, "Directory should be deleted");
        assert(!fileExists, "Nested file should be deleted");
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});

Deno.test({
  name: "test path normalization",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      await t.step("handle Windows-style paths", async () => {
        const windowsPath = "dir\\file.txt";
        const expectedPosixPath = "dir/file.txt";

        const result = await createValItem(val.id, {
          path: windowsPath,
          content: "test content",
          branchId: branch.id,
          type: "file",
        });

        assertEquals(
          result.path,
          expectedPosixPath,
          "Should normalize to POSIX path",
        );
      });

      await t.step("retrieve with normalized path", async () => {
        const version = await getLatestVersion(val.id, branch.id);
        const item = await getValItem(
          val.id,
          branch.id,
          version,
          "dir\\file.txt",
        );

        assert(item, "Should find item with Windows path");
        assertEquals(
          item.path,
          "dir/file.txt",
          "Should return normalized path",
        );
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});

Deno.test({
  name: "test utility functions",
  async fn(t) {
    await t.step("randomValName generates valid names", () => {
      const name1 = randomValName();
      const name2 = randomValName("test");

      assert(typeof name1 === "string", "Should return a string");
      assert(name1.length > 0, "Should not be empty");
      assert(name1.startsWith("a"), "Should start with 'a'");
      assert(!name1.includes("-"), "Should not contain hyphens");

      assert(name2.includes("test"), "Should include label");
      assert(name1 !== name2, "Should generate unique names");
    });

    await t.step("getCurrentUser returns user info", async () => {
      const user = await getCurrentUser();

      assert(typeof user.id === "string", "Should have user ID");
      assert(typeof user.username === "string", "Should have username");
      assert(user.username.length > 0, "Username should not be empty");
    });

    await t.step("createNewVal creates val", async () => {
      const valName = randomValName("test");
      const result = await createNewVal({
        name: valName,
        description: "Test val created by SDK test",
        privacy: "unlisted",
      });

      assert(result.id, "Should have an ID");
      assertEquals(result.name, valName, "Should have correct name");
      assertEquals(result.privacy, "unlisted", "Should have correct privacy");

      // Verify val exists
      const exists = await valExists(result.id);
      assert(exists, "Created val should exist");
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});

Deno.test({
  name: "test error handling",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      await t.step(
        "getValItem returns undefined for non-existent file",
        async () => {
          const version = await getLatestVersion(val.id, branch.id);
          const item = await getValItem(
            val.id,
            branch.id,
            version,
            "non-existent.txt",
          );
          assertEquals(
            item,
            undefined,
            "Should return undefined for non-existent file",
          );
        },
      );

      await t.step(
        "valItemExists returns false for non-existent file",
        async () => {
          const version = await getLatestVersion(val.id, branch.id);
          const exists = await valItemExists(
            val.id,
            branch.id,
            "non-existent.txt",
            version,
          );
          assert(!exists, "Should return false for non-existent file");
        },
      );

      await t.step("updateValFile fails for non-existent file", async () => {
        await assertRejects(
          () =>
            updateValFile(val.id, {
              path: "non-existent.txt",
              branchId: branch.id,
              content: "new content",
            }),
          Error,
          undefined,
          "Should throw error when updating non-existent file",
        );
      });

      await t.step("deleteValItem fails for non-existent file", async () => {
        await assertRejects(
          () =>
            deleteValItem(val.id, {
              path: "non-existent.txt",
              branchId: branch.id,
            }),
          Error,
          undefined,
          "Should throw error when deleting non-existent file",
        );
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});

Deno.test({
  name: "test memoization works correctly",
  async fn(t) {
    await doWithNewVal(async ({ val, branch }) => {
      // Create a test file
      await createValItem(val.id, {
        path: "memo-test.txt",
        content: "memoization test",
        branchId: branch.id,
        type: "file",
      });

      const version = await getLatestVersion(val.id, branch.id);

      await t.step("repeated calls should use memoized results", async () => {
        const result1 = await getValItem(
          val.id,
          branch.id,
          version,
          "memo-test.txt",
        );
        const result2 = await getValItem(
          val.id,
          branch.id,
          version,
          "memo-test.txt",
        );
        const result3 = await getValItem(
          val.id,
          branch.id,
          version,
          "memo-test.txt",
        );

        // Results should be identical (same object reference due to memoization)
        assertEquals(result1, result2, "Should return same memoized result");
        assertEquals(result2, result3, "Should return same memoized result");
      });

      await t.step("different parameters should not share cache", async () => {
        const item1 = await getValItem(
          val.id,
          branch.id,
          version,
          "memo-test.txt",
        );
        const item2 = await getValItem(
          val.id,
          branch.id,
          version,
          "non-existent.txt",
        );

        assert(item1 !== undefined, "Should find existing file");
        assert(item2 === undefined, "Should not find non-existent file");
      });
    });
  },
  sanitizeResources: false,
  sanitizeExit: false,
});
