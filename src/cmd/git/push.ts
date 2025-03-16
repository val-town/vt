import { Command } from "@cliffy/command";
import Kia from "kia";
import VTClient from "~/vt/vt/VTClient.ts";
import { displayStatusChanges } from "~/cmd/git/utils.ts";
import { vtRootOrFalse } from "~/cmd/utils.ts";

export const pushCmd = new Command()
  .name("push")
  .description("Push local changes to a val town project")
  .example("Push local changes", "vt push")
  .action(async () => {
    const spinner = new Kia("Pushing local changes...");
    spinner.start();

    const vtRoot = await vtRootOrFalse(spinner);
    if (!vtRoot) return;

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
