import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import Kia from "kia";
import { dirtyErrorMsg, displayStatusChanges } from "~/cmd/git/utils.ts";
import { findVTRoot } from "~/vt/vt/utils.ts";
import { colors } from "@cliffy/ansi/colors";
import { noVtDir } from "~/cmd/git/msgs.ts";

export const pullCmd = new Command()
  .name("pull")
  .description("Pull the latest changes for a val town project")
  .example("Pull the latest changes", "vt pull")
  .option("-f, --force", "Force the pull even if there are unpushed changes")
  .action(async ({ force }: { force?: boolean }) => {
    const spinner = new Kia("Pulling latest changes...");
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
