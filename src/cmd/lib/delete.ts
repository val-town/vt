import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import { Confirm } from "@cliffy/prompt";
import sdk from "~/sdk.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { colors } from "@cliffy/ansi/colors";

export const deleteCmd = new Command()
  .name("delete")
  .description("Delete the current Val")
  .option("-f, --force", "Skip confirmation prompt")
  .example("Delete current val", "vt delete")
  .action(async ({ force }: { force?: boolean }) => {
    await doWithSpinner("Deleting val...", async (spinner) => {
      const vtRoot = await findVtRoot(Deno.cwd());
      const vt = VTClient.from(vtRoot);
      const meta = vt.getMeta();
      const vtState = await meta.loadVtState();

      // Get Val name for display
      const val = await sdk.vals.retrieve(vtState.val.id);
      const valName = val.name;

      // Confirm deletion unless --force is used
      if (!force) {
        spinner.stop();
        const shouldDelete = await Confirm.prompt({
          message:
            `Are you sure you want to delete Val "${valName}"? This action cannot be undone.`,
          default: false,
        });

        if (!shouldDelete) {
          spinner.warn("Deletion cancelled.");
          return;
        }
      }

      spinner.start();
      await vt.delete();

      spinner.succeed(`Val "${valName}" has been deleted.`);
      spinner.info(
        colors.red(
          `You will no longer be able to use ${
            colors.bold("vt")
          } commands in this directory.`,
        ),
      );
    });
  });
