import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import Kia from "kia";
import { colors } from "@cliffy/ansi/colors";
import sdk from "~/sdk.ts";
import { FIRST_VERSION_NUMBER, STATUS_COLORS } from "~/consts.ts";
import { displayStatusChanges } from "~/cmd/git/utils.ts";
import { getTotalChanges } from "~/vt/git/utils.ts";

/**
 * Formats a version range string based on the first, current, and latest versions.
 */
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
export function formatStatus(path: string, status: string): string {
  const config = STATUS_COLORS[status] || { prefix: " ", color: colors.blue };
  return `${config.color(config.prefix)} ${path}`;
}

/**
 * Handles errors consistently across the application
 */
function handleError(error: unknown): void {
  if (error instanceof Error) {
    console.log(colors.red(error.message));
  }
}

export const watchStopCmd = new Command()
  .name("watch stop")
  .description("Stop the watch daemon process")
  .action(async () => {
    const cwd = Deno.cwd();
    const vt = VTClient.from(cwd);
    const kia = new Kia("Stopping the watch process...");
    kia.start();

    try {
      const pidStr = await vt.getMeta().getLockFile();
      if (pidStr) {
        const pid = parseInt(pidStr, 10);
        if (!isNaN(pid)) {
          Deno.kill(pid);
          kia.succeed(`Stopped watch process with PID: ${pid}`);
        } else {
          kia.fail("Invalid PID in lockfile.");
        }
      } else {
        kia.fail("No running watch process found.");
      }
    } catch (error) {
      kia.fail("Failed to stop the watch process.");
      console.error(error);
    }
  });

export const watchCmd = new Command()
  .name("watch")
  .description("Watch for changes and automatically sync with Val Town")
  .option(
    "-d, --debounce-delay <delay:number>",
    "Debounce delay in milliseconds",
    { default: 300 },
  )
  .action(async (options) => {
    const cwd = Deno.cwd();
    const spinner = new Kia("Starting watch mode...");
    spinner.start();
    const vt = VTClient.from(cwd);

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
    console.log(
      `On branch ${colors.cyan(currentBranch.name)}@${
        getVersionRangeStr(
          FIRST_VERSION_NUMBER,
          currentVersion,
          currentBranch.version,
        )
      }`,
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
        for await (const status of vt.watch(options.debounceDelay)) {
          try {
            if (getTotalChanges(status) > 0) {
              console.log();
              displayStatusChanges(status, {
                headerText: "New changes detected",
                summaryPrefix: "Pushed:",
              });
              console.log();
              console.log(watchingForChangesLine());
            }
          } catch (error) {
            handleError(error);
          }
        }
      } catch (error) {
        handleError(error);
      }
    }
  })
  .command("stop", watchStopCmd);
