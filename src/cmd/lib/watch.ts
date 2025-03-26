import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import { colors } from "@cliffy/ansi/colors";
import sdk from "~/sdk.ts";
import { FIRST_VERSION_NUMBER, STATUS_STYLES } from "~/consts.ts";
import { displayFileStateChanges } from "~/cmd/lib/utils.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import type { FileState } from "~/vt/lib/FileState.ts";

// Formats a version range string based on the first, current, and latest
// versions.
function getVersionRangeStr(
  firstVersion: number,
  currentVersion: number,
  latestVersion: number,
): string {
  if (currentVersion === latestVersion) {
    return colors.cyan(currentVersion.toString());
  }

  const versions = [firstVersion.toString(), currentVersion.toString()];
  if (latestVersion && currentVersion !== latestVersion) {
    versions.push(latestVersion.toString());
  }

  const formattedVersions = versions
    .map((v) => v === currentVersion.toString() ? colors.cyan(v) : v);

  return formattedVersions.join("..");
}

// Formats a file path with a colored status prefix for display.
export function formatStatus(
  path: string,
  status: keyof FileState,
): string {
  const config = STATUS_STYLES[status] || { prefix: " ", color: colors.blue };
  return `${config.color(config.prefix)} ${path}`;
}

export const watchStopCmd = new Command()
  .name("watch stop")
  .description("Stop the watch daemon process")
  .action(() => {
    const cwd = Deno.cwd();
    const vt = VTClient.from(cwd);
    doWithSpinner(
      "Stopping the watch process...",
      async ({ succeed }) => {
        try {
          const pidStr = await vt.getMeta().getLockFile();
          if (pidStr) {
            const pid = parseInt(pidStr, 10);
            if (!isNaN(pid)) {
              Deno.kill(pid);
              succeed(`Stopped watch process with PID: ${pid}`);
            } else {
              throw new Error("Invalid PID in lockfile.");
            }
          } else {
            throw new Error("No running watch process found.");
          }
        } catch {
          throw new Error("Failed to stop the watch process.");
        }
      },
    );
  });

export const watchCmd = new Command()
  .name("watch")
  .description("Watch for changes and automatically sync with Val Town")
  .option(
    "-d, --debounce-delay <delay:number>",
    "Debounce delay in milliseconds",
    { default: 300 },
  )
  .action((options) => {
    doWithSpinner("Starting watch...", async ({ spinner }) => {
      const vt = VTClient.from(await findVtRoot(Deno.cwd()));

      // Get initial branch information for display
      const {
        currentBranch: currentBranchId,
        version: currentVersion,
        projectId,
      } = await vt.getMeta().loadConfig();
      const currentBranch = await sdk.projects.branches.retrieve(
        projectId,
        currentBranchId,
      );

      spinner.stop();

      const versionRangeStr = getVersionRangeStr(
        FIRST_VERSION_NUMBER,
        currentVersion,
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

      while (true) {
        try {
          for await (
            const fileStateChanges of vt.watch(options.debounceDelay)
          ) {
            try {
              if (fileStateChanges.size() > 0) {
                console.log();
                displayFileStateChanges(fileStateChanges, {
                  emptyMessage: "No changes detected. Continuing to watch...",
                  headerText: "New changes detected",
                  summaryPrefix: "Pushed:",
                });
                console.log();
                console.log(watchingForChangesLine());
              }
            } catch (e) {
              if (e instanceof Error) console.log(colors.red(e.message));
            }
          }
        } catch (e) {
          if (e instanceof Error) console.log(colors.red(e.message));
        }
      }
    });
  })
  .command("stop", watchStopCmd);
