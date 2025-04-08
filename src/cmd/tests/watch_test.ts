import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { join } from "@std/path";
import { assert } from "@std/assert";
import { exists } from "@std/fs";
import { delay, retry } from "@std/async";
import VTClient from "~/vt/vt/VTClient.ts";
import { listProjectItems } from "~/sdk.ts";
import { runVtCommand, streamVtCommand } from "~/cmd/tests/utils.ts";

Deno.test({
  name: "simulate a watch",
  fn: async (t) =>
    await retry(async () => {
      await doWithTempDir(async (tmpDir) => {
        await doWithNewProject(async ({ project, branch }) => {
          let projectDir: string;
          let vt: VTClient;
          let watchChild: Deno.ChildProcess;
          let outputLines: string[];
          const createTimes: { path: string; time: number }[] = [];

          await t.step(
            "setup by cloneing project and starting watch process",
            async () => {
              // Create 10 files in rapid succession
              for (let i = 0; i <= 10; i++) {
                const filePath = join(projectDir!, `rapid-file-${i}.js`);
                await Deno.writeTextFile(
                  filePath,
                  `console.log('Rapid file ${i}');`,
                );
                createTimes.push({
                  path: `rapid-file-${i}.js`,
                  time: Date.now(),
                });
                // Add minimal delay between file creations to ensure they're
                // distinct events
                await delay(200);
              }

              // Wait for the debounce period plus buffer for the actual uploads
              await delay(15000); // Probably excessive
            },
          );

          try {
            await t.step(
              "create multiple files in rapid succession",
              async () => {
                // Create 10 files in rapid succession
                for (let i = 0; i <= 10; i++) {
                  const filePath = join(projectDir!, `rapid-file-${i}.js`);
                  await Deno.writeTextFile(
                    filePath,
                    `console.log('Rapid file ${i}');`,
                  );
                  createTimes.push({
                    path: `rapid-file-${i}.js`,
                    time: Date.now(),
                  });
                  // Add minimal delay between file creations to ensure they're
                  // distinct events
                  await delay(500);
                }

                // Wait for the debounce period plus buffer for the actual uploads
                await delay(10000); // Probably excessive
              },
            );

            await t.step("verify files were synced correctly", async () => {
              // Verify all files were synced
              const projectItemsAfterBatch = await listProjectItems(
                project.id,
                {
                  path: "",
                  branch_id: branch.id,
                  recursive: true,
                },
              );

              // Get status to verify all files are synced
              const statusAfterBatch = await vt!.status();

              // Check that all rapid files exist
              for (let i = 0; i <= 10; i++) {
                // The file should exist
                const fileExists = projectItemsAfterBatch
                  .some((item) => item.path === `rapid-file-${i}.js`);
                assert(
                  fileExists,
                  `rapid-file-${i}.js should exist in the project`,
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
    }, {
      maxAttempts: 2,
      maxTimeout: 30_000,
      minTimeout: 5_000,
    }),
  sanitizeResources: false,
});
