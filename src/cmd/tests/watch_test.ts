import { doWithNewProject } from "~/vt/lib/tests/utils.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";
import { join } from "@std/path";
import { assert } from "@std/assert";
import { exists } from "@std/fs";
import { delay } from "@std/async";
import VTClient from "~/vt/vt/VTClient.ts";
import { listProjectItems } from "~/sdk.ts";
import { runVtCommand, streamVtCommand } from "~/cmd/tests/utils.ts";

Deno.test({
  name: "simulate a watch",
  async fn(t) {
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
            // Clone the empty project
            await runVtCommand(["clone", project.name], tmpDir);

            // Get project directory path
            projectDir = join(tmpDir, project.name);
            assert(
              await exists(projectDir),
              "project directory should exist after clone",
            );

            // Create VTClient instance for direct API operations
            vt = VTClient.from(projectDir);

            // Start the watch process with a short debounce
            [outputLines, watchChild] = streamVtCommand(
              ["watch", "-d", "700"],
              projectDir,
            );

            // Wait for the watch process to start
            while (outputLines.length < 3) {
              await delay(100);
            }
          },
        );

        try {
          await t.step(
            "create multiple files in rapid succession",
            async () => {
              // Create 20 files in rapid succession
              for (let i = 0; i <= 20; i++) {
                const filePath = join(projectDir!, `rapid-file-${i}.js`);
                await Deno.writeTextFile(
                  filePath,
                  `console.log('Rapid file ${i}');`,
                );
                createTimes.push({
                  path: `rapid-file-${i}.js`,
                  time: Date.now(),
                });
                // Add minimal delay between file creations to ensure they're distinct events
                await delay(20);
              }

              // Wait for the debounce period plus buffer for the actual uploads
              await delay(10000); // Probably excessive
            },
          );

          await t.step("verify files were synced correctly", async () => {
            // Verify all files were synced
            const projectItemsAfterBatch = await listProjectItems(project.id, {
              path: "",
              branch_id: branch.id,
              recursive: true,
            });

            // Check that all rapid files exist
            for (let i = 0; i <= 20; i++) {
              const fileExists = projectItemsAfterBatch
                .some((item) => item.path === `rapid-file-${i}.js`);
              assert(
                fileExists,
                `rapid-file-${i}.js should exist in the project`,
              );
            }

            // Get status to verify all files are synced
            const statusAfterBatch = await vt!.status();

            // All rapid files should have "not_modified" status
            for (let i = 0; i <= 20; i++) {
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

          await t.step("verify debouncing worked correctly", () => {
            // Check output to verify debouncing worked We should not see
            // multiple sync operations during the rapid creation period
            const outputDuringRapidCreation = outputLines!.filter((line) => {
              // Look for lines that indicate a sync operation
              return line.includes("Syncing") && line.includes("files");
            });

            // We should have at most one sync operation for all 5 files due to
            // debouncing (might be zero if the sync happened after we checked)
            assert(
              outputDuringRapidCreation.length <= 1,
              `expected at most 1 sync operation during rapid file creation due ` +
                `to debouncing, but got ${outputDuringRapidCreation.length}`,
            );
          });
        } finally {
          await t.step("cleanup: stop watch process", async () => {
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
});
