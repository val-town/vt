import { Command } from "@cliffy/command";
import { displayStatusChanges, doVtAction } from "~/cmd/git/utils.ts";

export const pushCmd = new Command()
  .name("push")
  .description("Push local changes to a val town project")
  .example("Push local changes", "vt push")
  .action(() => {
    doVtAction("Pushing local changes...", async ({ spinner, vt }) => {
      const statusResult = await vt.push();
      spinner.stop();

      displayStatusChanges(statusResult, {
        emptyMessage: "Nothing to push, everything is up to date.",
        summaryPrefix: "Changes pushed:",
      });
    });
  });
