import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import sdk from "~/sdk.ts";
import { FIRST_VERSION_NUMBER } from "~/consts.ts";
import {
  displayFileStateChanges,
  getVersionRangeStr,
} from "~/cmd/lib/utils.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";

export const statusCmd = new Command()
  .name("status")
  .description("Show the working tree status")
  .action(() => {
    doWithSpinner("Checking status...", async (spinner) => {
      const vt = VTClient.from(await findVtRoot(Deno.cwd()));

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

      spinner.stop();
      console.log(
        `On branch ${colors.cyan(currentBranch.name)}@${versionStr}`,
      );
      console.log();

      console.log(displayFileStateChanges(await vt.status(), {
        headerText: "Local Changes:",
        emptyMessage: "No changes locally to push.",
        summaryText: "Changes to be pushed:",
      }));
    });
  });
