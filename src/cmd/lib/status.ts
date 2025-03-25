import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import sdk from "~/sdk.ts";
import { FIRST_VERSION_NUMBER, STATUS_STYLES } from "~/consts.ts";
import { displayStatusChanges, getVersionRangeStr } from "~/cmd/lib/utils.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import type { StatusResult } from "~/vt/lib/status.ts";

// Formats a file path with a colored status prefix for display.
export function formatStatus(path: string, status: keyof StatusResult): string {
  const config = STATUS_STYLES[status] || { prefix: " ", color: colors.gray };
  return `${config.color(config.prefix)} ${path}`;
}

export const statusCmd = new Command()
  .name("status")
  .description("Show the working tree status")
  .action(() => {
    doWithSpinner("Checking status...", async (spinner) => {
      const vt = VTClient.from(await findVtRoot(Deno.cwd()));

      const statusResult = await vt.status();
      const {
        currentBranch: currentBranchId,
        version: currentVersion,
        projectId,
      } = await vt.getMeta().loadConfig();

      const currentBranch = await sdk.projects.branches.retrieve(
        projectId,
        currentBranchId,
      );

      const versionStr = getVersionRangeStr(
        FIRST_VERSION_NUMBER,
        currentVersion,
        currentBranch.version,
      );

      spinner.stop(); // Stop spinner before showing status
      console.log(
        `On branch ${colors.cyan(currentBranch.name)}@${versionStr}`,
      );
      console.log();

      displayStatusChanges(statusResult, {
        summaryPrefix: "Changes to be pushed:",
      });
    });
  });
