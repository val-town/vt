#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net --allow-sys --allow-run
import { ensureGlobalVtConfig, globalConfig } from "~/vt/VTConfig.ts";

await ensureGlobalVtConfig();

import { onboardFlow } from "~/cmd/flows/onboard.ts";
import { API_KEY_KEY } from "~/consts.ts";

async function ensureApiKey() {
  // Check if API key is already in environment
  if (Deno.env.get(API_KEY_KEY) === undefined) {
    // Try to load from config first
    {
      const { apiKey } = await globalConfig.loadConfig();
      if (apiKey) {
        Deno.env.set(API_KEY_KEY, apiKey);
        return;
      }
    }

    // Run onboarding to ensure config exists
    await onboardFlow();

    // Load config again after onboarding
    {
      const { apiKey } = await globalConfig.loadConfig();
      if (apiKey) {
        Deno.env.set(API_KEY_KEY, apiKey);
      }
    }
  }
}

async function startVt() {
  const vt = (await import("~/cmd/root.ts")).cmd;
  await vt.parse(Deno.args);
}

if (import.meta.main) {
  await ensureApiKey();
  await startVt();
}
