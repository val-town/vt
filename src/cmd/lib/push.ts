import { Command } from "@cliffy/command";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import sdk, { user } from "~/sdk.ts";
import { displayFileStateChanges } from "~/cmd/lib/utils/displayFileStatus.ts";
import { noChangesDryRunMsg } from "~/cmd/lib/utils/messages.ts";

const nothingNewToPushMsg =
  "No local changes to push, remote state is up to date";

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

        const vtState = await vt.getMeta().loadVtState();
        const projectToPush = await sdk.projects.retrieve(vtState.project.id);
        if (projectToPush.author.id !== user.id) {
          throw new Error(
            "You are not the owner of this project, you cannot push." +
              "\nTo make a PR, go to the website, fork the project, clone the fork, make changes, push them, and then PR on the website.",
          );
        }

        // Note that we must wait until we have retrieved the status before
        // stopping the spinner
        if (dryRun) {
          // Perform a dry push to get what would be pushed.
          const statusResult = await vt.push({ dryRun: true });
          spinner.stop();

          console.log(displayFileStateChanges(statusResult, {
            headerText: "Changes that would be pushed:",
            summaryText: "Would push:",
            emptyMessage: nothingNewToPushMsg,
            includeSummary: true,
          }));

          console.log();
          spinner.succeed(noChangesDryRunMsg);
        } else {
          // Perform the actual push, store the status, and then report it.
          const statusResult = await vt.push();
          spinner.stop();

          // Display the changes that were pushed
          console.log(displayFileStateChanges(statusResult, {
            headerText: "Pushed:",
            emptyMessage: nothingNewToPushMsg,
            includeSummary: true,
          }));

          console.log();
          if (statusResult.hasWarnings()) {
            spinner.warn("Failed to push everything");
          } else {
            spinner.succeed("Successfully pushed local changes");
          }
        }
      },
    );
  });
