import { assert, assertEquals } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type ValTown from "@valtown/sdk";
import { dirIsEmpty } from "~/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import sdk, { getCurrentUser, randomProjectName } from "~/sdk.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";

Deno.test({
  name: "create project with existing directory name",
  async fn(c) {
    const user = await getCurrentUser();

    const emptyDirProjectName = "emptyDir" + randomProjectName();
    const nonEmptyDirProjectName = "nonEmptyDir" + randomProjectName();
    let emptyDirProject: ValTown.Projects.ProjectCreateResponse | null = null;

    await doWithTempDir(async (tmpDir) => {
      await c.step(
        "can create project with name of empty directory",
        async () => {
          // Create an empty directory
          const emptyDirPath = join(tmpDir, emptyDirProjectName);
          await Deno.mkdir(emptyDirPath);

          // Should succeed with empty directory
          await runVtCommand(["create", emptyDirProjectName], tmpDir);
          emptyDirProject = await sdk.alias.username.projectName.retrieve(
            user.username!,
            emptyDirProjectName,
          );

          assertEquals(emptyDirProject.name, emptyDirProjectName);

          // Clean up
          if (emptyDirProject) {
            await sdk.projects.delete(emptyDirProject.id);
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

<<<<<<< HEAD
Deno.test({
  name: "new project in specific directory",
  fn: async (c) => {
    const newProjectName = randomProjectName();
    let newProject: ValTown.Projects.ProjectCreateResponse | null = null;
=======
Deno.test("new project in specific directory", async (c) => {
  const user = await getCurrentUser();
  const newProjectName = randomProjectName();
  let newProject: ValTown.Projects.ProjectCreateResponse | null = null;
>>>>>>> f4cd9b4 (Prompt When API Key Goes Bad (#117))

    try {
      await doWithTempDir(async (tmpDir) => {
        await c.step("create a new project", async () => {
          await runVtCommand(["create", newProjectName], tmpDir);

          newProject = await sdk.alias.username.projectName.retrieve(
            user.username!,
            newProjectName,
          );

          assertEquals(newProject.name, newProjectName);
          assertEquals(newProject.author.username, user.username);
        });

<<<<<<< HEAD
        await c.step("make sure the project is cloned", async () => {
=======
      await c.step("make sure the project is cloned", async () => {
        assert(
          await exists(join(tmpDir, newProjectName)),
          "project was not cloned to target",
        );
      });
    });
  } finally {
    // @ts-ignore newProject is defined but something went wrong
    await sdk.projects.delete(newProject.id);
  }
});

Deno.test("create new private project", async (c) => {
  const user = await getCurrentUser();

  const newProjectName = randomProjectName();
  let newProject: ValTown.Projects.ProjectCreateResponse | null = null;

  try {
    await doWithTempDir(async (tmpDir) => {
      await c.step("create a new private project", async () => {
        await runVtCommand([
          "create",
          newProjectName,
          "--private",
        ], tmpDir);

        newProject = await sdk.alias.username.projectName.retrieve(
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
    if (newProject) await sdk.projects.delete(newProject.id);
  }
});

Deno.test("create new project in current working directory", async (c) => {
  const user = await getCurrentUser();

  const newProjectName = randomProjectName();
  let newProject: ValTown.Projects.ProjectCreateResponse | null = null;

  try {
    await doWithTempDir(async (tmpDir) => {
      // Mock the cwd function to return the temp directory
      await c.step("create a new project in current directory", async () => {
        await runVtCommand([
          "create",
          newProjectName,
        ], tmpDir);

        newProject = await sdk.alias.username.projectName.retrieve(
          user.username!,
          newProjectName,
        );

        assertEquals(newProject.name, newProjectName);
        assertEquals(newProject.author.username, user.username);
      });

      await c.step(
        "make sure the project is cloned to current directory",
        async () => {
>>>>>>> f4cd9b4 (Prompt When API Key Goes Bad (#117))
          assert(
            await exists(join(tmpDir, newProjectName)),
            "project was not cloned to target",
          );
        });
      });
    } finally {
      // @ts-ignore newProject is defined but something went wrong
      await sdk.projects.delete(newProject.id);
    }
  },
  sanitizeResources: false,
});

Deno.test({
  name: "create new private project",
  fn: async (c) => {
    const newProjectName = randomProjectName();
    let newProject: ValTown.Projects.ProjectCreateResponse | null = null;

    try {
      await doWithTempDir(async (tmpDir) => {
        await c.step("create a new private project", async () => {
          await runVtCommand([
            "create",
            newProjectName,
            "--private",
          ], tmpDir);

          newProject = await sdk.alias.username.projectName.retrieve(
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
      if (newProject) await sdk.projects.delete(newProject.id);
    }
  },
  sanitizeResources: false,
});

Deno.test({
  name: "create new project in current working directory",
  fn: async (c) => {
    const newProjectName = randomProjectName();
    let newProject: ValTown.Projects.ProjectCreateResponse | null = null;

    try {
      await doWithTempDir(async (tmpDir) => {
        // Mock the cwd function to return the temp directory
        await c.step("create a new project in current directory", async () => {
          await runVtCommand([
            "create",
            newProjectName,
          ], tmpDir);

          newProject = await sdk.alias.username.projectName.retrieve(
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
      if (newProject) await sdk.projects.delete(newProject.id);
    }
  },
  sanitizeResources: false,
});
