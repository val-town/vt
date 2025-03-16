import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import Kia from "kia";
import {
  dirtyErrorMsg,
  displayStatusChanges,
  vtRootOrFalse,
} from "~/cmd/git/utils.ts";

export const pullCmd = new Command()
  .name("pull")
  .description("Pull the latest changes for a val town project")
  .example("Pull the latest changes", "vt pull")
  .option("-f, --force", "Force the pull even if there are unpushed changes")
  .action(async ({ force }: { force?: boolean }) => {
    const spinner = new Kia("Pulling latest changes...");
    spinner.start();

    const vtRoot = await vtRootOrFalse(spinner);
    if (!vtRoot) return;

    try {
      const vt = VTClient.from(vtRoot);

      // Get the status manually so we don't need to re-fetch it for the pull
      const statusResult = await vt.status();
      if (!force && await vt.isDirty({ statusResult })) {
        spinner.fail(dirtyErrorMsg("pull"));
        return;
      }

      spinner.stop();

      await vt.pull({ statusResult });
      displayStatusChanges(statusResult, {
        emptyMessage: "Nothing new to pull, everything is up to date.",
        summaryPrefix: "Changes pulled:",
      });
    } finally {
      spinner.stop();
    }
  });
