import { Command } from "@cliffy/command";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import {
  dirtyErrorMsg,
  displayFileStateChanges,
  noChangesDryRunMsg,
} from "~/cmd/lib/utils.ts";
import { colors } from "@cliffy/ansi/colors";

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

        // Get the status manually so we don't need to re-fetch it for the pull
        const statusResult = await vt.status();
        if (!force && await vt.isDirty({ fileStateChanges: statusResult })) {
          if (!dryRun) {
            throw new Error(dirtyErrorMsg("pull"));
          } else {
            spinner.warn(
              colors.red("Current local state is dirty.") +
                " A " + colors.yellow(colors.bold("`pull -f`")) +
                " is needed to pull.",
            );
            console.log();
          }
        }

        // Get changes that would be pulled using the dry run option
        const fileStateChanges = await vt.pull({ dryRun: true });

        // Display the file changes
        if (dryRun) {
          spinner.stop();
          displayFileStateChanges(fileStateChanges, {
            headerText: "Changes that would be pulled:",
            summaryPrefix: "Would pull:",
            emptyMessage: "No changes to pull",
            includeSummary: true,
          });
          console.log();

          spinner.succeed(noChangesDryRunMsg);
        } else {
          // Perform the actual pull
          await vt.pull();
          spinner.stop();

          // Display the changes that were pulled
          displayFileStateChanges(fileStateChanges, {
            headerText: "Changes pulled:",
            summaryPrefix: "Pulled:",
            emptyMessage: "No changes were pulled",
            includeSummary: true,
          });
          console.log();

          spinner.succeed("Successfully pulled the latest changes");
        }
      },
    );
  });
