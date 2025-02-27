import { encodeHex } from "@std/encoding/hex";
import { createEmphasize } from "emphasize";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";

export function getValTownApiKey() {
  const token = Deno.env.get("VAL_TOWN_API_KEY") ||
    Deno.env.get("VALTOWN_TOKEN") || Deno.env.get("valtown");
  if (!token) {
    throw new Error("VAL_TOWN_API_KEY is required");
  }

  return token;
}

export async function hash(msg: string) {
  const data = new TextEncoder().encode(msg);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(hashBuffer);
}

export function printYaml(value: string) {
  if (Deno.stdout.isTerminal() || Deno.env.get("FORCE_COLOR")) {
    const emphasize = createEmphasize();
    emphasize.register({ yaml });
    console.log(emphasize.highlight("yaml", value).value);
  } else {
    console.log(value);
  }
}

export function printTypescript(value: string) {
  if (Deno.stdout.isTerminal() || Deno.env.get("FORCE_COLOR")) {
    const emphasize = createEmphasize();
    emphasize.register({ typescript });
    console.log(emphasize.highlight("typescript", value).value);
  } else {
    console.log(value);
  }
}

export function printMarkdown(value: string) {
  if (Deno.stdout.isTerminal() || Deno.env.get("FORCE_COLOR")) {
    const emphasize = createEmphasize();
    emphasize.register({ markdown });
    console.log(emphasize.highlight("markdown", value).value);
  } else {
    console.log(value);
  }
}

export function printJson(obj: unknown) {
  if (Deno.stdout.isTerminal() || Deno.env.get("FORCE_COLOR")) {
    const emphasize = createEmphasize();
    emphasize.register({
      json,
    });
    console.log(
      emphasize.highlight("json", JSON.stringify(obj, null, 2)).value,
    );
  } else {
    console.log(JSON.stringify(obj));
  }
}
