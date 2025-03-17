import { Command } from "@cliffy/command";
import { displayStatusChanges } from "~/cmd/git/utils.ts";
import { doWithSpinner, doWithVtClient } from "~/cmd/utils.ts";

export const pushCmd = new Command()
  .name("push")
  .description("Push local changes to a val town project")
  .example("Push local changes", "vt push")
  .action(() => {
    doWithSpinner("Pushing local changes...", (spinner) => {
      doWithVtClient(async (vt) => {
        const statusResult = await vt.push();
        spinner.stop();

        displayStatusChanges(statusResult, {
          emptyMessage: "Nothing to push, everything is up to date.",
          summaryPrefix: "Changes pushed:",
        });
      });
    });
  });
