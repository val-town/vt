import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import { Confirm } from "@cliffy/prompt";
import sdk from "~/sdk.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { colors } from "@cliffy/ansi/colors";

export const deleteCmd = new Command()
  .name("delete")
  .description("Delete a Val Town project")
  .option("-f, --force", "Skip confirmation prompt")
  .example("Delete current project", "vt delete")
  .action(async ({ force }: { force?: boolean }) => {
    await doWithSpinner("Deleting project...", async (spinner) => {
      const vtRoot = await findVtRoot(Deno.cwd());
      const vt = VTClient.from(vtRoot);
      const meta = vt.getMeta();
      const { projectId } = await meta.loadConfig();

      // Get project name for display
      const project = await sdk.projects.retrieve(projectId);
      const projectName = project.name;

      // Confirm deletion unless --force is used
      if (!force) {
        spinner.stop();
        const shouldDelete = await Confirm.prompt({
          message:
            `Are you sure you want to delete project "${projectName}"? This action cannot be undone.`,
          default: false,
        });

        if (!shouldDelete) {
          spinner.warn("Deletion cancelled.");
          return;
        }
      }

      await doWithSpinner(`Deleting project ${projectName}...`, async () => {
        await vt.delete();
        await sdk.projects.delete(projectId);
      });

      spinner.succeed(`Project "${projectName}" has been deleted.`);
      spinner.info(
        colors.red(
          `You will no longer be able to use ${
            colors.bold("vt")
          } commands in this directory.`,
        ),
      );
    });
  });
