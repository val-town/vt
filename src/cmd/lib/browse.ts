import { Command } from "@cliffy/command";
import open from "open";
import sdk from "~/sdk.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";

export const browseCmd = new Command()
  .name("browse")
  .description("Open a project in a web browser")
  .option("--no-browser", "Print destination url instead of opening browser")
  .action(async ({ browser }: { browser?: boolean }) => {
    const vt = VTClient.from(await findVtRoot(Deno.cwd()));

    const state = await vt.getMeta().loadVtState();
    const branch = await sdk.projects.branches.retrieve(
      state.project.id,
      String(state.branch.version),
    );

    if (browser) {
      await doWithSpinner("Opening project url...", async (spinner) => {
        await open(branch.links.html);
        spinner.succeed(`Project url opened in browser:\n${branch.links.html}`);
      });
    } else console.log(`${branch.links.html}`);
  });
