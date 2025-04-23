import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { exists } from "@std/fs/exists";
import { join } from "@std/path/join";
import type { ValTown } from "@valtown/sdk";
import { runVtCommand } from "~/cmd/tests/utils.ts";

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
          newProjectName
        );

        assertEquals(newProject.name, newProjectName);
        assertEquals(newProject.author.username, user.username);
      });

      await c.step(
        "make sure the project is cloned to current directory",
        async () => {
          assert(
            await exists(join(tmpDir, newProjectName)),
            "project was not cloned to current directory"
          );
        }
      );
    });
  } finally {
    // @ts-ignore newProject is defined but something went wrong
    if (newProject) await sdk.projects.delete(newProject.id);
  }
});

