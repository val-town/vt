import { assert, assertEquals } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type ValTown from "@valtown/sdk";
import sdk, { randomProjectName, user } from "~/sdk.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { dirIsEmpty } from "~/utils.ts";

Deno.test({
  name: "create project with existing directory name",
  async fn(c) {
    const emptyDirProjectName = "emptyDir" + randomProjectName();
    const nonEmptyDirProjectName = "nonEmptyDir" + randomProjectName();
    let emptyDirProject: ValTown.Val | null = null;

    await doWithTempDir(async (tmpDir) => {
      await c.step(
        "can create project with name of empty directory",
        async () => {
          // Create an empty directory
          const emptyDirPath = join(tmpDir, emptyDirProjectName);
          await Deno.mkdir(emptyDirPath);

          // Should succeed with empty directory
          await runVtCommand(["create", emptyDirProjectName], tmpDir);
          emptyDirProject = await sdk.alias.username.valName.retrieve(
            user.username!,
            emptyDirProjectName,
          );

          assertEquals(emptyDirProject.name, emptyDirProjectName);

          // Clean up
          if (emptyDirProject) {
            await sdk.vals.delete(emptyDirProject.id);
            emptyDirProject = null;
          }
        },
      );

      await c.step(
        "cannot create project with name of non-empty directory",
        async () => {
          // Create a non-empty directory
          const nonEmptyDirPath = join(tmpDir, nonEmptyDirProjectName);
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
            nonEmptyDirProjectName,
          ], tmpDir);
          assertEquals(status, 1);
        },
      );
    });
  },
  sanitizeResources: false,
});

Deno.test("new project in specific directory", async (c) => {
  const newProjectName = randomProjectName();
  let newProject: ValTown.Val | null = null;

  try {
    await doWithTempDir(async (tmpDir) => {
      await c.step("create a new project", async () => {
        await runVtCommand(["create", newProjectName], tmpDir);

        newProject = await sdk.alias.username.valName.retrieve(
          user.username!,
          newProjectName,
        );

        assertEquals(newProject.name, newProjectName);
        assertEquals(newProject.author.username, user.username);
      });

      await c.step("make sure the project is cloned", async () => {
        assert(
          await exists(join(tmpDir, newProjectName)),
          "project was not cloned to target",
        );
      });
    });
  } finally {
    // @ts-ignore newProject is defined but something went wrong
    await sdk.vals.delete(newProject.id);
  }
});

Deno.test("create new private project", async (c) => {
  const newProjectName = randomProjectName();
  let newProject: ValTown.Val | null = null;

  try {
    await doWithTempDir(async (tmpDir) => {
      await c.step("create a new private project", async () => {
        await runVtCommand([
          "create",
          newProjectName,
          "--private",
        ], tmpDir);

        newProject = await sdk.alias.username.valName.retrieve(
          user.username!,
          newProjectName,
        );

        assertEquals(newProject.name, newProjectName);
        assertEquals(newProject.author.username, user.username);
        assertEquals(
          newProject.privacy,
          "private",
          "project should be private",
        );
      });

      await c.step("make sure the project is cloned", async () => {
        assert(
          await exists(join(tmpDir, newProjectName)),
          "project was not cloned to target",
        );
      });
    });
  } finally {
    // @ts-ignore newProject is defined but something went wrong
    if (newProject) await sdk.vals.delete(newProject.id);
  }
});

Deno.test("create new project in current working directory", async (c) => {
  const newProjectName = randomProjectName();
  let newProject: ValTown.Val | null = null;

  try {
    await doWithTempDir(async (tmpDir) => {
      // Mock the cwd function to return the temp directory
      await c.step("create a new project in current directory", async () => {
        await runVtCommand([
          "create",
          newProjectName,
        ], tmpDir);

        newProject = await sdk.alias.username.valName.retrieve(
          user.username!,
          newProjectName,
        );

        assertEquals(newProject.name, newProjectName);
        assertEquals(newProject.author.username, user.username);
      });

      await c.step(
        "make sure the project is cloned to current directory",
        async () => {
          assert(
            await exists(join(tmpDir, newProjectName)),
            "project was not cloned to current directory",
          );
        },
      );
    });
  } finally {
    // @ts-ignore newProject is defined but something went wrong
    if (newProject) await sdk.vals.delete(newProject.id);
  }
});
