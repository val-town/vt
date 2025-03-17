import { Command } from "@cliffy/command";
import open from "open";
import sdk from "~/sdk.ts";
import { doWithSpinner, doWithVtClient } from "~/cmd/utils.ts";

export const browseCmd = new Command()
  .name("browse")
  .description("Open a project in a web browser")
  .option("--no-browser", "Print destination url instead of opening browser")
  .action(({ browser }: { browser?: boolean }) => {
    doWithVtClient(async (vt) => {
      const meta = await vt.getMeta().loadConfig();
      const branch = await sdk.projects.branches.retrieve(
        meta.projectId,
        meta.currentBranch,
      );

      if (browser) {
        await doWithSpinner("Opening project url...", async (spinner) => {
          await open(branch.links.html);
          spinner.succeed(
            `Project url opened in browser: ${branch.links.html}`,
          );
        });
      } else {
        console.log(`${branch.links.html}`);
      }
    });
  });
