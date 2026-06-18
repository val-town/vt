import {
  assertArrayIncludes,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { cmd } from "~/cmd/root.ts";
import { CLAUDE_CODE_PLUGIN_HINT, PLUGIN_DOCS_URL } from "~/consts.ts";

/** Runs `fn` with `console[method]` captured, returning everything it printed. */
async function capture(
  method: "log" | "error",
  fn: () => void | Promise<void>,
): Promise<string> {
  const lines: string[] = [];
  const original = console[method];
  console[method] = (...args: unknown[]) => void lines.push(args.join(" "));
  try {
    await fn();
  } finally {
    console[method] = original;
  }
  return lines.join("\n");
}

/** Runs `fn` with console.log captured, returning everything it printed. */
const captureLog = (fn: () => void | Promise<void>) => capture("log", fn);

/** Runs `fn` with the CLAUDECODE env var set to `value` (restored afterward). */
async function withClaudeCode<T>(
  value: string | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  const original = Deno.env.get("CLAUDECODE");
  if (value === undefined) Deno.env.delete("CLAUDECODE");
  else Deno.env.set("CLAUDECODE", value);
  try {
    return await fn();
  } finally {
    if (original === undefined) Deno.env.delete("CLAUDECODE");
    else Deno.env.set("CLAUDECODE", original);
  }
}

Deno.test("help screen recommends the Val Town plugin", async () => {
  // Bare `vt` and `vt --help` both render the top-level help via showHelp.
  const output = await captureLog(() => cmd.showHelp());

  assertStringIncludes(output, "Val Town plugin");
  assertStringIncludes(output, PLUGIN_DOCS_URL);
});

Deno.test("emits the Claude Code plugin hint when running inside Claude Code", async () => {
  const errors = await withClaudeCode(
    "1",
    () => capture("error", () => cmd.showHelp()),
  );

  // The hint must be on its own line for Claude Code to act on it.
  assertArrayIncludes(errors.split("\n"), [CLAUDE_CODE_PLUGIN_HINT]);
});

Deno.test("omits the plugin hint outside Claude Code", async () => {
  const errors = await withClaudeCode(
    undefined,
    () => capture("error", () => cmd.showHelp()),
  );

  assertEquals(errors.includes("claude-code-hint"), false);
});

Deno.test("unknown command prints the plugin recommendation", async () => {
  // An unknown command makes Cliffy print the help (carrying the note) and then
  // raise a validation error, which we swallow here.
  const output = await captureLog(async () => {
    // On an unknown command Cliffy prints the help (with our note) and then
    // calls Deno.exit. Stub exit so it throws and unwinds instead of aborting
    // the test, mirroring what the real binary prints first.
    const originalExit = Deno.exit;
    Deno.exit = ((code?: number) => {
      throw new Error(`Deno.exit(${code})`);
    }) as typeof Deno.exit;
    try {
      await cmd.parse(["definitelyNotACommand"]);
    } catch {
      // The stubbed exit (or a validation error) lands here.
    } finally {
      Deno.exit = originalExit;
    }
  });

  assertStringIncludes(output, "Val Town plugin");
  assertStringIncludes(output, PLUGIN_DOCS_URL);
});
