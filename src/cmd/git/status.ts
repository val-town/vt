import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import Kia from "kia";
import * as styles from "~/cmd/styling.ts";
import { colors } from "@cliffy/ansi/colors";
import { branchIdToName } from "~/sdk.ts";

function getVersionRangeStr(
  firstVersion: string | number,
  currentVersion: string | number,
  latestVersion?: string | number,
): string {
  const versions = [firstVersion.toString(), currentVersion.toString()];
  if (latestVersion && currentVersion !== latestVersion) {
    versions.push(latestVersion.toString());
  }

  const formattedVersions = versions.map((v) =>
    v === currentVersion.toString() ? colors.green(v) : v
  );

  return formattedVersions.join("..");
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
      const currentBranchVersion = await branchIdToName(
        projectId,
        currentBranch,
      );

      const status = await vt.status();
      spinner.stop(); // Stop spinner before showing status

      const statusMap = {
        modified: status.modified.map((file) => ({ path: file.path })),
        created: status.created.map((file) => ({ path: file.path })),
        deleted: status.deleted.map((file) => ({ path: file.path })),
      };

      // Print all changed files
      Object.entries(statusMap).forEach(([type, files]) => {
        files.forEach((file) => {
          console.log(styles.formatStatus(file.path, type));
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

