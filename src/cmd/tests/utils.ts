import { join, relative } from "@std/path";
import { walk } from "@std/fs";
import stripAnsi from "strip-ansi";
import { DEFAULT_BRANCH_NAME, DEFAULT_EDITOR_TEMPLATE } from "~/consts.ts";
import sdk, {
  branchNameToBranch,
  getCurrentUser,
  getLatestVersion,
  listValItems,
} from "~/sdk.ts";
import { ENTRYPOINT_NAME } from "~/consts.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { parseValUri } from "~/cmd/lib/utils/parsing.ts";
import { delay } from "@std/async";

/**
 * Creates and spawns a Deno child process for the vt.ts script.
 *
 * @param args - Arguments to pass to the script
 * @param cwd - Current working directory for the command
 * @param options - Additional options
 * @param options.env - Environment variables to set
 * @returns The spawned child process
 */
export function runVtProc(
  args: string[],
  cwd: string,
  options: {
    env?: Record<string, string>;
  } = {},
): Deno.ChildProcess {
  const commandPath = join(Deno.cwd(), ENTRYPOINT_NAME);
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", commandPath, ...args],
    stdout: "piped",
    stderr: "piped",
    stdin: "piped",
    cwd,
    env: options.env,
  });

  return command.spawn();
}

/**
 * Runs the vt.ts script with provided arguments.
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
    deadlineMs?: number;
  } = {},
): Promise<[string, number]> {
  const { autoConfirm = true, deadlineMs = 8_000 } = options;

  return await doWithTempDir(async (tmpDir) => {
    const process = runVtProc(args, cwd, {
      env: { XDG_CONFIG_HOME: join(tmpDir, "config"), ...options.env },
    });

    // If autoConfirm is enabled, send "yes\n" repeatedly to stdin
    let autoConfirmInterval: number | undefined;

    const cleanup = () => {
      if (autoConfirmInterval) {
        clearInterval(autoConfirmInterval);
        autoConfirmInterval = undefined;
      }

      clearTimeout(killTimeout);

      if (process.stdin.locked) {
        // Try to release the lock if possible
        try {
          const writer = process.stdin.getWriter();
          writer.releaseLock();
        } catch {
          // Ignore errors when trying to release the lock
        }
      }

      try {
        process.stdin.abort();
      } catch (e) {
        // Ignore errors when closing stdin
        if (!(e instanceof Error && e.name === "TypeError")) throw e;
      }

      try {
        process.kill();
      } catch (e) {
        // Ignore errors when killing the process if the process is already dead
        if (!(e instanceof Error && e.name === "TypeError")) throw e;
      }
    };

    const killTimeout = setTimeout(cleanup, deadlineMs);

    if (autoConfirm) {
      autoConfirmInterval = setInterval(() => {
        if (process.stdin.locked) return;
        try {
          const writer = process.stdin.getWriter();
          writer.write(new TextEncoder().encode("yes\n"))
            .catch(() => {
              // Ignore write errors
            });
          writer.releaseLock();
        } catch {
          // If getting writer fails (e.g., process exited), clear the interval
          if (autoConfirmInterval) {
            clearInterval(autoConfirmInterval);
            autoConfirmInterval = undefined;
          }
        }
      }, 500);
    }

    try {
      // Wait for the process to finish
      const { stdout, code } = await process.output();
      const stdoutText = new TextDecoder().decode(stdout);
      return [stripAnsi(stdoutText), code];
    } finally {
      // Ensure cleanup happens even if process.output() throws
      cleanup();
    }
  });
}

/**
 * Streams the output of the vt.ts script with provided arguments.
 * Returns an array that fills with output lines over time and the process.
 *
 * @param args - Arguments to pass to the script
 * @param cwd - Current working directory for the command
 * @param options - Additional options
 * @param options.env - Environment variables to set
 * @returns [outputLines, process]
 */
export function streamVtCommand(
  args: string[],
  cwd: string,
  options: {
    env?: Record<string, string>;
  } = {},
): [string[], Deno.ChildProcess] {
  const process = runVtProc(args, cwd, options);
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

/**
 * Removes all files in a directory that match the files found in the Val relative to the dirPath.
 *
 * @param dirPath - The directory to clean
 */
export async function removeAllEditorFiles(dirPath: string): Promise<void> {
  const user = await getCurrentUser();
  const { ownerName, valName } = parseValUri(
    DEFAULT_EDITOR_TEMPLATE,
    user.username!,
  );
  const templateProject = await sdk.alias.username.valName.retrieve(
    ownerName,
    valName,
  );
  const templateBranch = await branchNameToBranch(
    templateProject.id,
    DEFAULT_BRANCH_NAME,
  );
  const valItems = await listValItems(
    templateProject.id,
    templateBranch.id,
    await getLatestVersion(templateProject.id, templateBranch.id),
  );

  // Create a Set of relative paths for all files in the template val
  const templateFilePaths = new Set(valItems.map((item) => item.path));

  // Build a list of files to remove using Array.fromAsync with walk and filter
  const filesToRemove = (await Array.fromAsync(walk(dirPath)))
    .filter((entry) => templateFilePaths.has(relative(dirPath, entry.path)))
    .map((entry) => entry.path);

  // Then remove all the files
  for (const filePath of filesToRemove) {
    try {
      await Deno.remove(filePath, { recursive: true });
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        // Ignore if the file was already removed
      } else throw e;
    }
  }
}

/**
 * Waits until an array becomes stable (no new entries added) for a specified duration.
 *
 * @param array The array to monitor for stability
 * @param stableTimeMs The time in milliseconds that the array must remain unchanged
 * @returns A promise that resolves when the array is stable
 */
export async function waitForStable<T>(
  array: T[],
  stableTimeMs: number = 500,
): Promise<void> {
  let lastLength = array.length;

  while (true) {
    await delay(stableTimeMs);

    if (array.length === lastLength) {
      // Array is stable, we can exit the loop
      break;
    } else {
      // Array changed during timeout, update length and continue
      lastLength = array.length;
    }
  }
}
