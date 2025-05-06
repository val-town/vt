import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import { colors } from "@cliffy/ansi/colors";
import sdk, { getLatestVersion, getValItem, listValItems } from "~/sdk.ts";
import { FIRST_VERSION_NUMBER } from "~/consts.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { displayFileStateChanges } from "~/cmd/lib/utils/displayFileStatus.ts";
import { displayVersionRange } from "~/cmd/lib/utils/displayVersionRange.ts";
import VTCompanion from "~/vt/VTCompanion.ts";

export const watchCmd = new Command()
  .name("watch")
  .description("Watch for changes and automatically sync with Val Town")
  .option(
    "--no-companion",
    "Disable the companion browser extension WebSocket server",
  )
  .option(
    "-d, --debounce-delay <delay:number>",
    "Debounce delay in milliseconds",
    { default: 100 },
  )
  .action(async ({ companion: useCompanion, debounceDelay }) => {
    await doWithSpinner("Starting watch...", async (spinner) => {
      const vt = VTClient.from(await findVtRoot(Deno.cwd()));

      // Get initial branch information for display
      const vtState = await vt.getMeta().loadVtState();
      const currentBranch = await sdk.vals.branches.retrieve(
        vtState.val.id,
        vtState.branch.id,
      );

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

      let companion: VTCompanion | undefined;

      if (useCompanion) {
        // We may get a flurry of reconnections (because of how the extension
        // scans ports on localhost to find VT), so we have a buffer time
        let lastReconnectedMessage = 0;

        companion = new VTCompanion({
          onConnect: () => {
            const now = Date.now();

            if (now - lastReconnectedMessage < 1000) return;

            if (lastReconnectedMessage === 0) {
              console.log();
              console.log(
                colors.green(
                  "Browser companion connected to VT. Tabs will reload on changes.",
                ),
              );
              console.log();
            } else {
              console.log();
              console.log(
                colors.yellow(
                  "Browser companion reconnected to VT. Tabs will reload on changes.",
                ),
              );
              console.log();
            }

            lastReconnectedMessage = now;
          },
        });
        companion.start();
      }

      try {
        await vt.watch(async (fileStateChanges) => {
          const newVersion = await getLatestVersion(
            vtState.val.id,
            vtState.branch.id,
          );

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

            if (companion) {
              for (const modifiedEntry of fileStateChanges.modified) {
                const path = modifiedEntry.path;
                const valItem = await getValItem(
                  vtState.val.id,
                  vtState.branch.id,
                  newVersion,
                  path,
                );
                if (valItem && valItem.links.endpoint) {
                  companion.reloadTab(valItem.links.endpoint);
                }
              }
            }
          } catch (e) {
            if (e instanceof Error) console.log(colors.red(e.message));
          }
        }, debounceDelay);

        // This line would only execute if watch() completes normally
        console.log(colors.yellow("Watch process ended."));
      } catch (e) {
        if (e instanceof Error) console.log(colors.red(e.message));
      }
    });
  });
