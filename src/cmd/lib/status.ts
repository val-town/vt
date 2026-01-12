import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import sdk from "~/sdk.ts";
import {
  DEFAULT_WRAP_WIDTH,
  FIRST_VERSION_NUMBER,
  PROGRAM_NAME,
} from "~/consts.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { displayFileStateChanges } from "~/cmd/lib/utils/displayFileStatus.ts";
import { displayVersionRange } from "~/cmd/lib/utils/displayVersionRange.ts";
import wrap from "word-wrap";

export const statusCmd = new Command()
  .name("status")
  .description("Show the working tree status")
  .action(() => {
    doWithSpinner("Checking status...", async (spinner) => {
      const vt = VTClient.from(await findVtRoot(Deno.cwd()));

      const vtState = await vt.getMeta().loadVtState();

      const currentBranch = await sdk.vals.branches.retrieve(
        vtState.val.id,
        vtState.branch.id,
      );

      const versionStr = displayVersionRange(
        FIRST_VERSION_NUMBER,
        vtState.branch.version,
        currentBranch.version,
      );

      spinner.stop();
      console.log(
        `On branch ${colors.cyan(currentBranch.name)}@${versionStr}`,
      );
      console.log();

      // vt.status, for historical reasons, is just a dry push
      const statusResult = await vt.status({});

      console.log(displayFileStateChanges(statusResult, {
        headerText: "Changes between local and remote:",
        emptyMessage: "Local state matches remote state.",
        summaryText: "Changes between local and remote:",
        includeSummary: false,
        includeTypes: false,
        includeStatuses: false,
      }));

      if (statusResult.changes() > 0) {
        console.log()
        console.log(
          wrap(
            `Your local state differs from the website. \`${PROGRAM_NAME}\` cannot yet automatically sync differences.` +
            `In order to sync your state, you must either:\n\n` +
            `- Push all of your changes to Val Town by using \`vt push\`\n` +
            `- Pull all your changes from the website using \`vt pull\`\n\n` +
            `You can simulate a push or pull by including \`--dry-run\`.`,
          { width: DEFAULT_WRAP_WIDTH, indent: "" },

          ),
        );
      }
    });
  });
