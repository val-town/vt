import { Command } from "@cliffy/command";
import open from "open";
import sdk from "../../utils/sdk.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { delay } from "@std/async";

export const browseCmd = new Command()
  .name("browse")
  .description("Open a Val's main page in a web browser")
  .option("--no-browser", "Print destination url instead of opening browser")
  .action(async ({ browser }: { browser?: boolean }) => {
    const vt = VTClient.from(await findVtRoot(Deno.cwd()));

    const vtState = await vt.getMeta().loadVtState();
    const branch = await sdk.vals.branches.retrieve(
      vtState.val.id,
      vtState.branch.id,
    );

    if (browser) {
      await doWithSpinner("Opening Val url...", async (spinner) => {
        await open(branch.links.html);
        await delay(150);
        spinner.succeed(`Val url opened in browser:\n${branch.links.html}`);
      });
    } else console.log(`${branch.links.html}`);
  });
