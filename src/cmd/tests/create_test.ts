import { assert, assertEquals } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type ValTown from "@valtown/sdk";
import { cmd } from "~/cmd/root.ts";
import sdk, { randomProjectName, user } from "~/sdk.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";

Deno.test("create new project and clone", async (c) => {
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
    // Clean up -- delete the project
    if (newProject) {
      // @ts-ignore newProject.id is defined by here
      await sdk.projects.delete(newProject.id);
    }
  }
});
