import { Command } from "@cliffy/command";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import {
  displayFileStateChanges,
  noChangesDryRunMsg,
} from "~/cmd/lib/utils.ts";
import { Confirm } from "@cliffy/prompt";

export const pullCmd = new Command()
  .name("pull")
  .description("Pull the latest changes for a val town project")
  .example("Pull the latest changes", "vt pull")
  .option("-f, --force", "Force the pull even if there are unpushed changes")
  .option(
    "-d, --dry-run",
    "Show what would be pulled without making any changes",
  )
  .action(({ force, dryRun }: { force?: boolean; dryRun?: boolean }) => {
    doWithSpinner(
      dryRun
        ? "Checking for remote changes that would be pulled..."
        : "Pulling latest changes...",
      async (spinner) => {
        const vt = VTClient.from(await findVtRoot(Deno.cwd()));
        const vtConfig = await vt.getConfig().loadConfig();

        // Check if dirty, then early exit if it's dirty and they don't
        // want to proceed. If in force mode don't do this check.
        const fileStateChanges = await vt.pull({ dryRun: true });
        if ((await vt.isDirty()) && !force) {
          spinner.stop();

          // Display what would be pulled when dirty
          displayFileStateChanges(fileStateChanges, {
            headerText: "Changes that would be pulled:",
            summaryText: "Would pull:",
            emptyMessage: "No changes to pull, local state is up to date",
            includeTypes: !dryRun,
            includeSummary: true,
          });
          console.log();

          // No need to confirm since they are just doing a dry run
          if (dryRun) return;

          // Ask for confirmation to proceed despite dirty state
          if (
            vtConfig.dangerousOperations &&
            vtConfig.dangerousOperations.confirmation
          ) {
            const shouldProceed = await Confirm.prompt({
              message:
                "There are changes being pulled that would overwrite the local state." +
                " Are you sure you want to proceed?",
              default: false,
            });
            if (!shouldProceed) Deno.exit(0); // This is what they wanted
            console.log();
          }
        }

        if (dryRun) {
          spinner.stop();
          displayFileStateChanges(fileStateChanges, {
            headerText: "Changes that would be pulled:",
            summaryText: "Would pull:",
            emptyMessage: "No changes to pull, local state is up to date",
            includeTypes: !dryRun,
            includeSummary: true,
          });
          console.log();
          spinner.succeed(noChangesDryRunMsg);
        } else {
          // Perform the actual pull
          const realPullChanges = await vt.pull();
          spinner.stop();
          displayFileStateChanges(realPullChanges, {
            headerText: "Changes pulled:",
            summaryText: "Pulled:",
            emptyMessage: "No changes were pulled, local state is up to date",
            includeTypes: !dryRun,
            includeSummary: true,
          });
          console.log();
          spinner.succeed("Successfully pulled the latest changes");
        }
      },
    );
  });
