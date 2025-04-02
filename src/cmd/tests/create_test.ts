import { assert, assertEquals } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type ValTown from "@valtown/sdk";
import { cmd } from "~/cmd/root.ts";
import sdk, { randomProjectName, user } from "~/sdk.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";

Deno.test("create new project in specific directory", async (c) => {
  const newProjectName = randomProjectName();
  let newProject: ValTown.Projects.ProjectCreateResponse | null = null;

  try {
    await doWithTempDir(async (tmpDir) => {
      await c.step("create a new project", async () => {
        await cmd.parse(["create", newProjectName, tmpDir]);

        newProject = await sdk.alias.username.projectName.retrieve(
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
    await sdk.projects.delete(newProject.id);
  }
});

Deno.test("create new private project", async (c) => {
  const newProjectName = randomProjectName();
  let newProject: ValTown.Projects.ProjectCreateResponse | null = null;

  try {
    await doWithTempDir(async (tmpDir) => {
      await c.step("create a new private project", async () => {
        await cmd.parse(["create", newProjectName, "--private", tmpDir]);

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
  const newProjectName = randomProjectName();
  let newProject: ValTown.Projects.ProjectCreateResponse | null = null;
  const originalCwd = Deno.cwd;

  try {
    await doWithTempDir(async (tmpDir) => {
      // Mock the cwd function to return the temp directory
      Deno.cwd = () => tmpDir;

      await c.step("create a new project in current directory", async () => {
        await cmd.parse(["create", newProjectName]);

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
    // Restore the original cwd function
    Deno.cwd = originalCwd;
    // @ts-ignore newProject is defined but something went wrong
    if (newProject) await sdk.projects.delete(newProject.id);
  }
});
