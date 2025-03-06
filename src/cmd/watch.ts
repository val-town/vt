import { Command } from "@cliffy/command";
import { relative } from "@std/path";
import Kia from "kia";
import VTClient from "~/vt/vt/VTClient.ts";

const programPath = new URL("../../vt.ts", import.meta.url).pathname;

export const watchCmd = new Command()
  .name("watch")
  .description("Watch for changes and automatically sync with Val Town")
  .option("--daemon [daemon:boolean]", "Run as daemon process", {
    default: false,
  })
  .action(async ({ daemon }) => {
    const cwd = Deno.cwd();
    console.log(programPath);

    if (daemon) {
      const command = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--allow-read",
          "--allow-write",
          "--allow-env",
          "--allow-net",
          programPath,
          "watch",
        ],
        stdin: "null",
        stdout: "inherit",
        stderr: "inherit",
      });

      const child = command.spawn();
      console.log("Watch process started in background");
      console.log("Process ID:", child.pid);
      child.unref()

      return;
    }

    // Non-daemon mode
    const spinner = new Kia("Starting watch mode...");
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
