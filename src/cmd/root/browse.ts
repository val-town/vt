import { Command } from "@cliffy/command";
import Kia from "kia";
import VTClient from "~/vt/vt/VTClient.ts";
import open from "open";
import sdk from "~/sdk.ts";

export const browseCmd = new Command()
  .name("browse")
  .description("Open a project in a web browser")
  .option("--no-browser", "Print destination url instead of opening browser")
  .action(async ({ browser }: { browser?: boolean }) => {
    const cwd = Deno.cwd();
    const spinner = browser ? new Kia("Opening project url...") : null;
    try {
      const vt = VTClient.from(cwd);
      const meta = await vt.getMeta().loadConfig();
      const branch = await sdk.projects.branches.retrieve(
        meta.projectId,
        meta.currentBranch,
      );
      if (browser) {
        await open(branch.links.html);
        spinner?.succeed(`Project url opened in browser: ${branch.links.html}`);
      } else {
        console.log(`${branch.links.html}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        spinner?.fail(error.message);
      }
    }
  });
