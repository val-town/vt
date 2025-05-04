#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net --allow-sys --allow-run
import "@std/dotenv/load";
import { ensureGlobalVtConfig, globalConfig } from "~/vt/VTConfig.ts";
import { onboardFlow } from "~/cmd/flows/onboard.ts";
import { API_KEY_KEY } from "~/consts.ts";
import { colors } from "@cliffy/ansi/colors";

await ensureGlobalVtConfig();

async function isApiKeyValid(): Promise<boolean> {
  const apiKey = Deno.env.get(API_KEY_KEY);
  if (!apiKey) return false;

  const resp = await fetch("https://api.val.town/v1/me", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return resp.status !== 401;
}

async function ensureValidApiKey() {
  if (Deno.env.has(API_KEY_KEY) && await isApiKeyValid()) return;

  {
    const { apiKey } = await globalConfig.loadConfig();
    if (apiKey) {
      Deno.env.set(API_KEY_KEY, apiKey);

      // Validate the loaded key
      if (await isApiKeyValid()) return;

      console.log(
        colors.red("Your saved API key is no longer valid.") +
          " This happens when it expires or is revoked.",
      );
      console.log();
      await onboardFlow({ showWelcome: false });
    } else {
      console.log("Let's set up your Val Town API key.");
      await onboardFlow();
    }
  }

  {
    const { apiKey } = await globalConfig.loadConfig();
    if (apiKey) {
      Deno.env.set(API_KEY_KEY, apiKey);
      if (await isApiKeyValid()) {
        return;
      }
    }
  }
}

async function startVt() {
  const vt = (await import("~/cmd/root.ts")).cmd;
  await vt.parse(Deno.args);
}

if (import.meta.main) {
  await ensureValidApiKey();
  await startVt();
}
