import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import { colors } from "@cliffy/ansi/colors";
import sdk, { getCurrentUser } from "~/sdk.ts";
import { FIRST_VERSION_NUMBER } from "~/consts.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { displayFileStateChanges } from "~/cmd/lib/utils/displayFileStatus.ts";
import { displayVersionRange } from "~/cmd/lib/utils/displayVersionRange.ts";

export const watchCmd = new Command()
  .name("watch")
  .description("Watch for changes and automatically sync with Val Town")
  .option(
    "-d, --debounce-delay <delay:number>",
    "Debounce delay in milliseconds",
    { default: 250 },
  )
  .action(async (options) => {
    await doWithSpinner("Starting watch...", async (spinner) => {
      const vt = VTClient.from(await findVtRoot(Deno.cwd()));
      const user = await getCurrentUser();

      // Get initial branch information for display
      const vtState = await vt.getMeta().loadVtState();
      const currentBranch = await sdk.vals.branches.retrieve(
        vtState.val.id,
        vtState.branch.id,
      );

      const valToWatch = await sdk.vals.retrieve(vtState.val.id);
      if (valToWatch.author.id !== user.id) {
        console.log(valToWatch.author.id, user.id);
        throw new Error(
          "You are not the owner of this Val, you cannot watch." +
            "\nTo make changes to this Val, go to the website, fork the Val, and clone the fork.",
        );
      }

      spinner.stop();

      const versionRangeStr = displayVersionRange(
        FIRST_VERSION_NUMBER,
        vtState.branch.version,
        currentBranch.version,
      );
      console.log(
        `On branch ${colors.cyan(currentBranch.name)}@${versionRangeStr}`,
      );

      console.log("Watching for changes. Press Ctrl+C to stop.");

      const watchingForChangesLine = () =>
        colors.gray(
          `--- watching for changes (@${new Date().toLocaleTimeString()}) ---`,
        );

      console.log();
      console.log(watchingForChangesLine());

      try {
        await vt.watch((fileStateChanges) => {
          try {
            if (fileStateChanges.size() > 0) {
              console.log();
              console.log(displayFileStateChanges(fileStateChanges, {
                emptyMessage: "No changes detected. Continuing to watch...",
                headerText: "New changes detected",
                summaryText: "Pushed:",
              }));
              console.log();
              console.log(watchingForChangesLine());
            }
          } catch (e) {
            if (e instanceof Error) console.log(colors.red(e.message));
          }
        }, options.debounceDelay);

        // This line would only execute if watch() completes normally
        console.log(colors.yellow("Watch process ended."));
      } catch (e) {
        if (e instanceof Error) console.log(colors.red(e.message));
      }
    });
  });
