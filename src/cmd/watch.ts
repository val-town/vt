import { Command } from "@cliffy/command";
import Kia from "kia";
import VTClient from "~/vt/vt/VTClient.ts";

export const watchCmd = new Command()
  .name("watch")
  .description("Watch for changes and automatically sync with Val Town")
  .action(async () => {
    const spinner = new Kia("Starting watch mode...");
    const cwd = Deno.cwd();

    try {
      spinner.start();
      const vt = VTClient.from(cwd);

      spinner.info("Watching for file changes...");
      spinner.info("Press Ctrl+C to stop");

      await vt.watch();
    } catch (error) {
      if (error instanceof Error) {
        spinner.fail(error.message);
      }
    }
  });
