import { Command } from "@cliffy/command";
import {
  displayFileStateChanges,
  noChangesDryRunMsg,
} from "~/cmd/lib/utils.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";

export const pushCmd = new Command()
  .name("push")
  .description("Push local changes to a val town project")
  .example("Push local changes", "vt push")
  .option(
    "-d, --dry-run",
    "Show what would be pushed without making any changes",
  )
  .action(({ dryRun }: { dryRun?: boolean }) => {
    doWithSpinner(
      dryRun
        ? "Checking for local changes that would be pushed..."
        : "Pushing local changes...",
      async (spinner) => {
        const vt = VTClient.from(await findVtRoot(Deno.cwd()));

        // Get changes that would be pushed using the dry run option
        const fileStateChanges = await vt.status();

        if (dryRun) {
          spinner.stop();
          displayFileStateChanges(fileStateChanges, {
            headerText: "Changes that would be pushed:",
            summaryPrefix: "Would push:",
            emptyMessage: "No changes to push",
            includeSummary: true,
          });
          console.log();

          if (await vt.isDirty({ fileStateChanges })) {
            spinner.info(
              " Note that pushing is a forceful operation." +
                "\n   All remote changes will be made to match the local state.",
            );
            console.log();
          }
          spinner.succeed(noChangesDryRunMsg);
        } else {
          // Perform the actual push
          const statusResult = await vt.push();
          spinner.stop();

          // Display the changes that were pushed
          displayFileStateChanges(statusResult, {
            headerText: "Changes pushed:",
            summaryPrefix: "Changes pushed:",
            emptyMessage: "Nothing new to push, everything is up to date.",
            includeSummary: true,
          });
          console.log();

          spinner.succeed("Successfully pushed local changes");
        }
      },
    );
  });
