import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import Kia from "kia";
import * as styles from "~/cmd/styling.ts";
import { colors } from "@cliffy/ansi/colors";
import { branchIdToBranch } from "~/sdk.ts";
import { STATUS_COLORS } from "~/consts.ts";

function getVersionRangeStr(
  firstVersion: string | number,
  currentVersion: string | number,
  latestVersion?: string | number,
): string {
  const versions = [firstVersion.toString(), currentVersion.toString()];
  if (latestVersion && currentVersion !== latestVersion) {
    versions.push(latestVersion.toString());
  }

  const formattedVersions = versions
    .map((v) => v === currentVersion.toString() ? colors.green(v) : v);

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
  .action(async () => {
    const spinner = new Kia("Checking status...");

    try {
      spinner.start();
      const vt = VTClient.from(Deno.cwd());

      const { currentBranch, version: currentVersion, projectId } = await vt
        .getMeta()
        .loadConfig();
      const currentBranchVersion = await branchIdToBranch(
        currentBranch,
        projectId,
      );

      const status = await vt.status();
      spinner.stop(); // Stop spinner before showing status

      // Display branch and version information
      console.log(`On branch ${colors.cyan(currentBranchVersion.toString())}`);

      // Get the first version (could be retrieved from history or use 1 as default)
      const firstVersion = 1; // Replace with actual first version if available
      const latestVersion = currentVersion; // Replace with actual latest version if different

      console.log(
        "Version: " +
          getVersionRangeStr(firstVersion, currentVersion, latestVersion) +
          "\n",
      );

      const statusMap = {
        modified: status.modified.map((file) => ({ path: file.path })),
        created: status.created.map((file) => ({ path: file.path })),
        deleted: status.deleted.map((file) => ({ path: file.path })),
      };

      // Print all changed files
      Object.entries(statusMap).forEach(([type, files]) => {
        files.forEach((file) => {
          console.log(formatStatus(file.path, type));
        });
      });

      // Print summary
      const totalChanges = Object.values(statusMap).reduce(
        (sum, files) => sum + files.length,
        0,
      );

      if (totalChanges === 0) {
        console.log(styles.success("Working tree clean"));
      } else {
        console.log("\nChanges:");
        Object.entries(statusMap).forEach(([type, files]) => {
          if (files.length > 0) {
            console.log(`  ${files.length} ${type}`);
          }
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        spinner.fail(error.message);
      }
    }
  });
