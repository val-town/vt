import { assertStringIncludes } from "@std/assert";
import { cmd } from "~/cmd/root.ts";
import { PLUGIN_DOCS_URL } from "~/consts.ts";

/** Runs `fn` with console.log captured, returning everything it printed. */
async function captureLog(fn: () => void | Promise<void>): Promise<string> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.join(" "));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

Deno.test("help screen recommends the Val Town plugin", async () => {
  // Bare `vt` and `vt --help` both render the top-level help via showHelp.
  const output = await captureLog(() => cmd.showHelp());

  assertStringIncludes(output, "Val Town plugin");
  assertStringIncludes(output, PLUGIN_DOCS_URL);
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
