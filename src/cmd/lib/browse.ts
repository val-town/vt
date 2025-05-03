import { Command } from "@cliffy/command";
import open from "open";
import sdk from "../../../utils/sdk.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { delay } from "@std/async";

export const browseCmd = new Command()
  .name("browse")
  .description("Open a project in a web browser")
  .option("--no-browser", "Print destination url instead of opening browser")
  .action(async ({ browser }: { browser?: boolean }) => {
    const vt = VTClient.from(await findVtRoot(Deno.cwd()));

    const state = await vt.getMeta().loadVtState();
    const branch = await sdk.projects.branches.retrieve(
      state.project.id,
      state.branch.id,
    );

    if (browser) {
      await doWithSpinner("Opening project url...", async (spinner) => {
        await open(branch.links.html);
        await delay(150);
        spinner.succeed(`Project url opened in browser:\n${branch.links.html}`);
      });
    } else console.log(`${branch.links.html}`);
  });
