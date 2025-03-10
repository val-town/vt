import { Command } from "@cliffy/command";
import Kia from "kia";
import VTClient from "~/vt/vt/VTClient.ts";
import { runCmd } from "../../vt.ts";
import { spawn } from "node:child_process";
import process from "node:process";

export const watchStopCmd = new Command()
  .name("watch stop")
  .description("Stop the watch daemon process")
  .action(async () => {
    const cwd = process.cwd();
    const vt = VTClient.from(cwd);
    const kia = new Kia("Stopping the watch process...");
    kia.start();

    try {
      const pidStr = await vt.meta.getLockFile();
      if (pidStr) {
        const pid = parseInt(pidStr, 10);
        if (!isNaN(pid)) {
          process.kill(pid);
          kia.succeed(`Stopped watch process with PID: ${pid}`);
        } else {
          kia.fail("Invalid PID in lockfile.");
        }
      } else {
        kia.fail("No running watch process found.");
      }
    } catch (error) {
      kia.fail("Failed to stop the watch process.");
      console.error(error);
    }
  });

export const watchCmd = new Command()
  .name("watch")
  .description("Watch for changes and automatically sync with Val Town")
  .option("--daemon [daemon:boolean]", "Run as daemon process", {
    default: false,
  })
  .action(async ({ daemon }) => {
    const cwd = process.cwd();

    if (daemon) {
      const [binary, args] = runCmd(["watch"]);

      // Spawn a detached child process
      const child = spawn(binary, args, {
        detached: true,
        stdio: "ignore",
      });

      console.log("Watch process started in background");
      console.log("Process ID:", child.pid);
      child.unref(); // Let's us exit with proc still running

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
  })
  .command("stop", watchStopCmd);
