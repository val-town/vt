import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import { colors } from "@cliffy/ansi/colors";
import sdk, { getLatestVersion, listProjectItems } from "~/sdk.ts";
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
    { default: 1500 },
  )
  .action(async ({ companion: useCompanion, debounceDelay }) => {
    await doWithSpinner("Starting watch...", async (spinner) => {
      const vt = VTClient.from(await findVtRoot(Deno.cwd()));

      const state = await vt.getMeta().loadVtState();
      const currentBranch = await sdk.projects.branches.retrieve(
        state.project.id,
        state.branch.id,
      );

      spinner.stop();

      const versionRangeStr = displayVersionRange(
        FIRST_VERSION_NUMBER,
        state.branch.version,
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

      let connectedBefore = false;
      let companion: VTCompanion | undefined;
      if (useCompanion) {
        companion = new VTCompanion({
          onConnect: () => {
            if (connectedBefore) {
              console.log();
              console.log(
                colors.yellow(
                  "Browser companion reconnected to VT. Tabs will reload on changes.",
                ),
              );
              console.log();
              return;
            }
            connectedBefore = true;
            console.log();
            console.log(
              colors.green(
                "Browser companion connected to VT. Tabs will reload on changes.",
              ),
            );
            console.log();
          },
        });
        companion.start();
      }

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

            if (companion) {
              vt.getMeta().loadVtState()
                .then(async (state) =>
                  await listProjectItems(
                    state.project.id,
                    state.branch.id,
                    await getLatestVersion(state.project.id, state.branch.id),
                  )
                )
                .then((projectItems) =>
                  projectItems
                    .filter((projectItem) => !!projectItem.links.endpoint)
                    .map((projectItem) => projectItem.links.endpoint)
                    .forEach((link) => companion.reloadTab(link!))
                );
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
