import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import sdk from "~/sdk.ts";
import { FIRST_VERSION_NUMBER, STATUS_COLORS } from "~/consts.ts";
import { displayStatusChanges, doVtAction } from "~/cmd/git/utils.ts";

// - Only the current version (in green) if it equals the latest version
// - A range string "firstVersion..currentVersion..latestVersion" with currentVersion in green
//   if the current version is less than the latest version
function getVersionRangeStr(
  firstVersion: number,
  currentVersion: number,
  latestVersion: number,
): string {
  // If current version is the latest, only return the current version in green
  if (currentVersion === latestVersion) {
    return colors.cyan(currentVersion.toString());
  }

  // Otherwise, return the full range
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
  const config = STATUS_COLORS[status] || { prefix: " ", color: colors.gray };
  return `${config.color(config.prefix)} ${path}`;
}

export const statusCmd = new Command()
  .name("status")
  .description("Show the working tree status")
  .action(() => {
    doVtAction("Checking status...", async ({ spinner, vt }) => {
      const {
        currentBranch: currentBranchId,
        version: currentVersion,
        projectId,
      } = await vt.getMeta().loadConfig();

      const currentBranch = await sdk.projects.branches.retrieve(
        projectId,
        currentBranchId,
      );

      const status = await vt.status();
      spinner.stop(); // Stop spinner before showing status

      const versionStr = getVersionRangeStr(
        FIRST_VERSION_NUMBER,
        currentVersion,
        currentBranch.version,
      );
      console.log(`On branch ${colors.cyan(currentBranch.name)}@${versionStr}`);
      console.log();

      displayStatusChanges(status, { summaryPrefix: "Changes to be pushed:" });
    });
  });
