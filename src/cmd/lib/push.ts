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
      async ({ spinner, succeed }) => {
        const vt = VTClient.from(await findVtRoot(Deno.cwd()));

        // Note that we must wait until we have retrieved the status before
        // stopping the spinner
        if (dryRun) {
          // Perform a dry push to get what would be pushed.
          const statusResult = await vt.push({ dryRun: true });
          spinner.stop();

          displayFileStateChanges(statusResult, {
            headerText: "Changes that would be pushed:",
            summaryPrefix: "Would push:",
            emptyMessage: "No changes to push",
            includeSummary: true,
          });

          console.log();
          succeed(noChangesDryRunMsg);
        } else {
          // Perform the actual push, store the status, and then report it.
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
          succeed("Successfully pushed local changes");
        }
      },
    );
  });
