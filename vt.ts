#!/usr/bin/env -S deno run -A
import { cmd as vt } from "~/cmd/root.ts";

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
export function scriptCmd(): string[] {
  const executablePath = Deno.execPath();
  const scriptUrl = import.meta.url;
  const args = Deno.args;
  const fullCmd = [executablePath, scriptUrl, ...args];
  return fullCmd;
}
