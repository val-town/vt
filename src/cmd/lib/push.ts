import { Command } from "@cliffy/command";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import sdk, { canWriteToVal } from "~/sdk.ts";
import { displayFileStateChanges } from "~/cmd/lib/utils/displayFileStatus.ts";
import { noChangesDryRunMsg } from "~/cmd/lib/utils/messages.ts";
import { authedWithEnvNote } from "./utils/authedWithEnvNote.ts";

const nothingNewToPushMsg =
  "No local changes to push, remote state is up to date";

export const pushCmd = new Command()
  .name("push")
  .description("Push local changes to a Val")
  .example("Push local changes", "vt push")
  .option(
    "-d, --dry-run",
    "Show what would be pushed without making any changes",
  )
  .action(async ({ dryRun }: { dryRun?: boolean }) => {
    await doWithSpinner(
      dryRun
        ? "Checking for local changes that would be pushed..."
        : "Pushing local changes...",
      async (spinner) => {
        const vt = VTClient.from(await findVtRoot(Deno.cwd()));

        const vtState = await vt.getMeta().loadVtState();
        const valToPush = await sdk.vals.retrieve(vtState.val.id);
        if (!(await canWriteToVal(valToPush.id))) {
          throw new Error(
            "You do not have write access to this Val, you cannot push." +
              "\nTo make changes to this Val, go to the website, fork the Val, and clone the fork." +
              authedWithEnvNote(),
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
