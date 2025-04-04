import { join } from "@std/path";
import stripAnsi from "strip-ansi";
import { ENTRYPOINT_NAME } from "~/consts.ts";
import { doWithTempDir } from "~/vt/lib/utils.ts";

/**
 * Runs the vt.ts script with provided arguments.
 *
 * Automatically sends "yes" to stdin to confirm any prompts, so that the
 * prompts themselves get captured.
 *
 * @param args - Arguments to pass to the script
 * @param cwd - Current working directory for the command
 * @param options - Additional options
 * @param options.env - Environment variables to set
 * @param options.autoConfirm - Automatically confirm prompts
 * @returns Tuple containing [merged output (stdout+stderr), exit code]
 */
export async function runVtCommand(
  args: string[],
  cwd: string,
  options: {
    env?: Record<string, string>;
    autoConfirm?: boolean;
  } = {},
): Promise<[string, number]> {
  options = { autoConfirm: true, ...options };

  return await doWithTempDir(async (tmpDir) => {
    // Configure and spawn the process
    const commandPath = join(Deno.cwd(), ENTRYPOINT_NAME);
    const command = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", commandPath, ...args],
      stdout: "piped",
      stderr: "piped",
      stdin: "piped",
      cwd,
      env: { XDG_CONFIG_HOME: join(tmpDir, "config"), ...options.env },
    });

    const process = command.spawn();

    // Send "y" to automatically confirm prompts
    if (options.autoConfirm) {
      const stdin = process.stdin.getWriter();
      await stdin.write(new TextEncoder().encode("y\n"));
      stdin.releaseLock();
    }

    // Close stdin to prevent resource leaks
    await process.stdin.close();

    // Collect and process the output
    const { stdout, stderr, code } = await process.output();
    const stdoutText = new TextDecoder().decode(stdout);
    const stderrText = new TextDecoder().decode(stderr);
    const combinedOutput = stdoutText + stderrText;

    return [stripAnsi(combinedOutput), code];
  });
}

/**
 * Streams the output of the vt.ts script with provided arguments.
 * Returns an array that fills with output lines over time and the process.
 *
 * @param args - Arguments to pass to the script
 * @param cwd - Current working directory for the command
 * @returns [outputLines, process]
 */
export function streamVtCommand(
  args: string[],
  cwd: string,
): [string[], Deno.ChildProcess] {
  const commandPath = join(Deno.cwd(), ENTRYPOINT_NAME);
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", commandPath, ...args],
    stdout: "piped",
    stderr: "piped",
    cwd,
  });

  const process = command.spawn();
  const outputLines: string[] = [];

  // Read stdout
  (async () => {
    for await (const chunk of process.stdout) {
      const text = stripAnsi(new TextDecoder().decode(chunk));
      text.split("\n").forEach((line) => {
        if (line.trim()) outputLines.push(line.trim());
      });
    }
  })();

  // Read stderr
  (async () => {
    for await (const chunk of process.stderr) {
      const text = stripAnsi(new TextDecoder().decode(chunk));
      text.split("\n").forEach((line) => {
        if (line.trim()) outputLines.push(line.trim());
      });
    }
  })();

  return [outputLines, process];
}
