import { createEmphasize } from "emphasize";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * Prints a YAML string with syntax highlighting.
 *
 * @param value - The YAML string to be printed
 */
export function printYaml(value: string) {
  if (Deno.stdout.isTerminal() || Deno.env.get("FORCE_COLOR")) {
    const emphasize = createEmphasize();
    emphasize.register({ yaml });
    console.log(emphasize.highlight("yaml", value).value);
  } else {
    console.log(value);
  }
}

/**
 * Prints TypeScript with syntax highlighting.
 *
 * @param value - The TypeScript string to be printed
 */
export function printTypescript(value: string) {
  const emphasize = createEmphasize();
  emphasize.register({ typescript });
  console.log(emphasize.highlight("typescript", value).value);
}

/**
 * Prints a Markdown string to the console with syntax highlighting.
 *
 * @param value - The Markdown string to be printed
 */
export function printMarkdown(value: string) {
  const emphasize = createEmphasize();
  emphasize.register({ markdown });
  console.log(emphasize.highlight("markdown", value).value);
}

/**
 * Prints a JSON object to the console with syntax highlighting.
 *
 * @param obj - The object to be stringified to JSON and printed
 */
export function printJson(obj: unknown) {
  const emphasize = createEmphasize();
  emphasize.register({ json });
  console.log(emphasize.highlight("json", JSON.stringify(obj, null, 2)).value);
}
