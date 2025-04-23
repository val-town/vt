import { Command } from "@cliffy/command";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { tty } from "@cliffy/ansi/tty";
import { Confirm } from "@cliffy/prompt";
import { colors } from "@cliffy/ansi/colors";
import { displayFileStateChanges } from "~/cmd/lib/utils/displayFileStatus.ts";
import { noChangesDryRunMsg } from "~/cmd/lib/utils/messages.ts";

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

        // Check if dirty, then early exit if it's dirty and they don't
        // want to proceed. If in force mode don't do this check.
        const fileStateChanges = await vt.pull({ dryRun: true });
        let prepareForResult = () => {};
        if (
          fileStateChanges.deleted.length > 0 ||
          fileStateChanges.modified.length > 0 && !force
        ) {
          spinner.stop();

          const dangerousChanges = displayFileStateChanges(fileStateChanges, {
            headerText: `Changes that ${colors.underline("would be pulled")}:`,
            summaryText: "Would pull:",
            emptyMessage: "No changes to pull, local state is up to date",
            includeTypes: !dryRun,
            includeSummary: true,
          }) + "\n";

          // Display what would be pulled when dirty
          console.log(dangerousChanges);

          // No need to confirm since they are just doing a dry run
          if (dryRun) return;
          console.log();

          // Ask for confirmation to proceed despite dirty state
          const shouldProceed = await Confirm.prompt({
            message:
              "There are changes being pulled that would overwrite the local state." +
              " Are you sure you want to proceed?",
            default: false,
          });
          if (!shouldProceed) {
            Deno.exit(0);
          } else {
            prepareForResult = () =>
              tty
                .eraseLines(dangerousChanges.split("\n").length + 3);
          }
        }

        if (dryRun) {
          spinner.stop();
          prepareForResult();
          console.log(displayFileStateChanges(fileStateChanges, {
            headerText: `Changes that ${colors.underline("would be pulled")}:`,
            summaryText: "Would pull:",
            emptyMessage: "No changes to pull, local state is up to date",
            includeTypes: !dryRun,
            includeSummary: true,
          }));
          console.log();
          spinner.succeed(noChangesDryRunMsg);
        } else {
          // Perform the actual pull
          const realPullChanges = await vt.pull();
          spinner.stop();
          prepareForResult();
          console.log(displayFileStateChanges(realPullChanges, {
            headerText: "Changes " + colors.underline("pulled:"),
            summaryText: "Pulled:",
            emptyMessage: "No changes were pulled, local state is up to date",
            includeTypes: !dryRun,
            includeSummary: true,
          }));
          console.log();
          spinner.succeed("Successfully pulled the latest changes");
        }
      },
    );
  });
