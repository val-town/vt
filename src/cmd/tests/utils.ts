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
    confirmPause?: number;
  } = {},
): Promise<[string, number]> {
  const { autoConfirm = false, confirmPause = 50 } = options;

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
    if (autoConfirm) {
      const stdin = process.stdin.getWriter();
      await stdin.write(new TextEncoder().encode("y\n"));
      await delay(confirmPause || 50);
      await stdin.write(new TextEncoder().encode("\n"));
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
