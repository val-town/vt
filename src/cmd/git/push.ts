import { Command } from "@cliffy/command";
import { displayStatusChanges } from "~/cmd/git/utils.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";

export const pushCmd = new Command()
  .name("push")
  .description("Push local changes to a val town project")
  .example("Push local changes", "vt push")
  .action(() => {
    doWithSpinner("Pushing local changes...", async (spinner) => {
      const vt = VTClient.from(await findVtRoot(Deno.cwd()));

      const statusResult = await vt.push();

      spinner.stop();
      displayStatusChanges(statusResult, {
        emptyMessage: "Nothing to push, everything is up to date.",
        summaryPrefix: "Changes pushed:",
      });
    });
  });
