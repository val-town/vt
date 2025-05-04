import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import { join } from "@std/path";
import { assert } from "@std/assert";
import { exists } from "@std/fs";
import { delay } from "@std/async";
import VTClient from "~/vt/vt/VTClient.ts";
import { getLatestVersion, listValItems, valItemExists } from "~/sdk.ts";
import {
  runVtCommand,
  streamVtCommand,
  waitForStable,
} from "~/cmd/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";

Deno.test({
  name: "simulate a watch",
  permissions: "inherit",
  fn: async (t) => {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        let valDir: string;
        let vt: VTClient;
        let watchChild: Deno.ChildProcess;
        let outputLines: string[];
        const createTimes: { path: string; time: number }[] = [];

        await t.step(
          "setup by cloneing val and starting watch process",
          async () => {
            await runVtCommand(
              ["clone", val.name, "--no-editor-files"],
              tmpDir,
            );

            valDir = join(tmpDir, val.name);
            assert(
              await exists(valDir),
              "val directory should exist after clone",
            );

            vt = VTClient.from(valDir);
            [outputLines, watchChild] = streamVtCommand(["watch"], valDir);

            await waitForStable(outputLines);
          },
        );

        try {
          await t.step(
            "create multiple files in rapid succession",
            async () => {
              // Create 10 files in rapid succession
              for (let i = 0; i <= 20; i++) {
                const filePath = join(valDir!, `rapid-file-${i}.js`);
                await Deno.writeTextFile(filePath, `// 'Rapid file ${i}'`);
                createTimes.push({
                  path: `rapid-file-${i}.js`,
                  time: Date.now(),
                });

                // Half way through, wait a bit, so that an upload gets
                // triggered. Then make sure that that upload got triggered.
                if (i === 10) {
                  // Wait for the debounce period plus buffer for the actual
                  // uploads
                  await delay(5000);

                  assert(
                    await valItemExists(
                      val.id,
                      branch.id,
                      `rapid-file-${i - 1}.js`,
                      await getLatestVersion(val.id, branch.id),
                    ),
                    "file should exist in val after upload",
                  );
                }

                // Add minimal delay between file creations to ensure they're
                // distinct events
                await delay(10);
              }

              // Wait for the debounce period plus buffer for the actual uploads
              await delay(4000);
            },
          );

          await t.step("verify files were synced correctly", async () => {
            // Verify all files were synced
            const valItemsAfterBatch = await listValItems(
              val.id,
              branch.id,
              await getLatestVersion(val.id, branch.id),
            );

            // Get status to verify all files are synced
            const statusAfterBatch = await vt!.status();

            // Check that all rapid files exist
            for (let i = 0; i <= 20; i++) {
              // The file should exist
              const fileExists = valItemsAfterBatch
                .some((item) => item.path === `rapid-file-${i}.js`);

              assert(
                fileExists,
                `rapid-file-${i}.js should exist in the val`,
              );

              // All rapid files should have "not_modified" status
              const fileStatus = statusAfterBatch.filter(
                (file) =>
                  file.path === `rapid-file-${i}.js` &&
                  file.status === "not_modified",
              );
              assert(
                fileStatus.size() > 0,
                `rapid-file-${i}.js should have not_modified status`,
              );
            }
          });
        } finally {
          await t.step("cleanup and stop watch process", async () => {
            // Close stdin
            watchChild!.stdin?.abort();

            // Send SIGINT to the watch process
            watchChild!.kill("SIGINT");
            await watchChild!.status;

            // Wait, then make sure "Stopping watch process" got logged
            await delay(1000);
            assert(
              outputLines
                .some((line) => line.includes("Stopping watch process")),
              "watch process should have been stopped",
            );
          });
        }
      });
    });
  },
  sanitizeResources: false,
});
