import { assertEquals } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { clone } from "~/vit/lib/mod.ts";
import * as testUtils from "~/vit/lib/test_utils.ts";

Deno.test({
  name: "clone val town project test",
  permissions: {
    read: true,
    write: true,
    net: true,
  },
  async fn() {
    const { testDir, cleanup } = await testUtils.getTestDir("clone");

    // The project and branch IDs to test cloning
    // https://www.val.town/x/wolf/vtCliTestProj
    const projectId = "b95fe488-f4de-11ef-97f1-569c3dd06744";
    const branchId = "b9602cf4-f4de-11ef-97f1-569c3dd06744";

    // Do the clone
    await clone(testDir, projectId, branchId);

    // This is what we should get (we know apriori)
    const expectedInodes: testUtils.ExpectedProjectInode[] = [
      {
        path: "proudLimeGoose.H.tsx",
        type: "file",
        content: "// Example content",
      },
      { path: "merryCopperAsp.S.tsx", type: "file" },
      { path: "thoughtfulPeachPrimate", type: "directory" },
      {
        path: join("thoughtfulPeachPrimate", "philosophicalBlueWolf"),
        type: "directory",
      },
      {
        path: join("thoughtfulPeachPrimate", "clearAquamarineSmelt.C.tsx"),
        type: "file",
      },
      {
        path: join("thoughtfulPeachPrimate", "tirelessHarlequinSmelt"),
        type: "file",
      },
    ];

    // Now make sure we got what we wanted
    const structureValid = await testUtils.verifyProjectStructure(
      testDir,
      expectedInodes,
    );
    assertEquals(structureValid, true, "Project structure verification failed");

    cleanup();
  },
});
