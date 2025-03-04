import { clone } from "~/vt/git/clone.ts";
import { withTempDir } from "~/vt/git/utils.ts";
import * as path from "@std/path";
import { assertEquals } from "@std/assert";
import { ExpectedProjectInode, pull, verifyProjectStructure } from "~/vt/git/pull.ts";

Deno.test({
  name: "pull updated cloned project",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    const { tempDir, cleanup } = await withTempDir("vt_clone");

    // The project and branch IDs to test cloning
    // https://www.val.town/x/wolf/vtCliTestProj
    const projectId = "b95fe488-f4de-11ef-97f1-569c3dd06744";
    const branchId = "b9602cf4-f4de-11ef-97f1-569c3dd06744";
    const version = 8;

    // Do the clone
    await clone({
      targetDir: tempDir,
      projectId,
      branchId,
      version: version + 2, // Different version
    });

    // Pull a different version
    await pull({
      projectId,
      branchId,
      targetDir: tempDir,
      version,
      ignoreGlobs: [],
    });

    // Set the content
    const expectedInodes: ExpectedProjectInode[] = [
      {
        path: "proudLimeGoose.http.tsx",
        type: "file",
        content: "// Example Content",
      },
      {
        path: "merryCopperAsp.script.tsx",
        type: "file",
        content: "",
      },
      {
        path: "thoughtfulPeachPrimate",
        type: "directory",
      },
      {
        path: path.join(
          "thoughtfulPeachPrimate",
          "clearAquamarineSmelt.cron.tsx",
        ),
        type: "file",
        content: 'const test = "test";',
      },
      {
        path: path.join("thoughtfulPeachPrimate", "tirelessHarlequinSmelt"),
        type: "file",
        content: "",
      },
    ];

    // Now make sure we got what we wanted
    const structureValid = await verifyProjectStructure(
      tempDir,
      expectedInodes,
    );
    assertEquals(structureValid, true, "Project structure verification failed");

    await cleanup();
  },
});
