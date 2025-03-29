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

        // Always get changes that would be pulled using dry run
        const fileStateChanges = await vt.pull({ dryRun: true });

        // Helper function to display file state changes and add a newline
        const displayChanges = (isDone: boolean) => {
          const headerText = isDone
            ? "Changes pulled:"
            : "Changes that would be pulled:";
          const summaryPrefix = isDone ? "Pulled:" : "Would pull:";

          displayFileStateChanges(fileStateChanges, {
            headerText: headerText,
            summaryText: summaryPrefix,
            emptyMessage: isDone
              ? "No changes were pulled, local state is up to date"
              : "No changes to pull, local state is up to date",
            includeTypes: !dryRun,
            includeSummary: true,
          });
          console.log();
        };

        // Check if dirty, then early exit if it's dirty and they don't
        // want to proceed. If in force mode don't do this check.
        const isDirty = await vt.isDirty({ fileStateChanges });

        if (isDirty && !force) {
          spinner.stop();

          // Display what would be pulled when dirty
          displayChanges(false);

          if (dryRun) {
            spinner.warn(
              colors.red("Current local state is dirty.") +
                " A " + colors.yellow(colors.bold("`pull -f`")) +
                " is needed to pull.",
            );
            console.log();
            spinner.succeed(noChangesDryRunMsg);
            return;
          }

          // Ask for confirmation to proceed despite dirty state
          const shouldProceed = await Confirm.prompt({
            message: dirtyErrorMsg("pull"),
            default: false,
          });
          if (!shouldProceed) Deno.exit(0); // This is what they wanted
        }

        if (dryRun) {
          spinner.stop();
          displayChanges(false);
          spinner.succeed(noChangesDryRunMsg);
        } else {
          // Perform the actual pull
          await vt.pull();
          spinner.stop();
          displayChanges(true);
          spinner.succeed("Successfully pulled the latest changes");
        }
      },
    );
  });
