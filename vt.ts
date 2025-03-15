#!/usr/bin/env -S deno run -A
import { cmd as vt } from "~/cmd/root/root.ts";

export default vt;

if (import.meta.main) {
  await vt.parse(Deno.args);
}

/**
 * Returns the full command-line invocation as an array.
 * This includes the path to the executable and any script/module URL,
 * followed by the arguments passed to the program.
 *
 * @returns {string[]} An array containing the executable path, script/module URL, and arguments.
 */
export function runCmd(args: string[]): [string, string[]] {
  const executablePath = Deno.execPath();
  const scriptModule = Deno.mainModule;

  // Check if running as a compiled executable
  const isCompiled = executablePath === scriptModule;

  if (isCompiled) {
    // Running as a compiled executable
    // You don't need to explicitly provide the deno executable the permission
    // flags since ideally it is baked in at compile time.
    return [executablePath, args];
  } else {
    // Running with `deno run`, include deno executable and necessary flags
    const scriptPath = new URL(scriptModule).pathname;

    // When running with deno you need to explicitly provide all the required
    // flags
    return [
      executablePath,
      [
        "run",
        "--allow-read",
        "--allow-write",
        "--allow-env",
        "--allow-net",
        scriptPath,
        ...args,
      ],
    ];
  }
}
