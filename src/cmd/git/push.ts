import { Command } from "@cliffy/command";
import Kia from "kia";
import VTClient from "~/vt/vt/VTClient.ts";
import { displayStatusChanges } from "~/cmd/git/utils.ts";
import { findVTRoot } from "~/vt/vt/utils.ts";
import { colors } from "@cliffy/ansi/colors";
import { noVtDir } from "~/cmd/git/msgs.ts";

export const pushCmd = new Command()
  .name("push")
  .description("Push local changes to a val town project")
  .example("Push local changes", "vt push")
  .action(async () => {
    const spinner = new Kia("Pushing local changes...");
    spinner.start();

    let vtRoot;
    try {
      vtRoot = await findVTRoot(Deno.cwd());
    } catch (e) {
      spinner.stop();
      if (e instanceof Deno.errors.NotFound) {
        console.log(colors.red(noVtDir));
        return;
      }
      throw e;
    }

    try {
      const vt = VTClient.from(vtRoot);
      const statusResult = await vt.push();
      spinner.stop();

      displayStatusChanges(statusResult, {
        emptyMessage: "Nothing to push, everything is up to date.",
        summaryPrefix: "Changes pushed:",
      });
    } finally {
      spinner.stop();
    }
  });
