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

      const vtState = await vt.getMeta().loadVtState();

      const currentBranch = await sdk.projects.branches.retrieve(
        vtState.project.id,
        vtState.branch.id,
      );

      const versionStr = getVersionRangeStr(
        FIRST_VERSION_NUMBER,
        vtState.branch.version,
        currentBranch.version,
      );

      spinner.stop();
      console.log(
        `On branch ${colors.cyan(currentBranch.name)}@${versionStr}`,
      );
      console.log();

      displayFileStateChanges(await vt.status(), {
        headerText: "Local Changes:",
        emptyMessage: "No changes locally to push.",
        summaryText: "Changes to be pushed:",
      });
    });
  });
