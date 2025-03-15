import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import Kia from "kia";

export const pullCmd = new Command()
  .name("pull")
  .description("Pull the latest changes for a val town project")
  .option("-f, --force", "Force the pull even if there are unpushed changes")
  .action(async ({ force }: { force?: boolean }) => {
    const spinner = new Kia("Pulling latest changes...");
    const cwd = Deno.cwd();

    try {
      const vt = VTClient.from(cwd);
      spinner.start();

      if (!force && await vt.isDirty()) {
        spinner.fail(
          "Cannot pull with unpushed changes. " +
            "Use `pull -f` to discard local changes.",
        );
        return;
      }

      await vt.pull(cwd);
      spinner.succeed(`Project pulled successfully to ${cwd}`);
    } catch (error) {
      if (error instanceof Error) {
        spinner.fail(error.message);
      }
    }
  });
