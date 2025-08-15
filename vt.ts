#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net --allow-sys --allow-run
import "@std/dotenv/load";
import { ensureGlobalVtConfig, globalConfig } from "~/vt/VTConfig.ts";
import { onboardFlow } from "~/cmd/flows/onboard.ts";
import {
  API_KEY_KEY,
  AUTH_CACHE_LOCALSTORE_ENTRY,
  AUTH_CACHE_TTL,
} from "~/consts.ts";
import { colors } from "@cliffy/ansi/colors";
import sdk from "~/sdk.ts";
import { registerOutdatedWarning } from "~/cmd/upgrade.ts";

await ensureGlobalVtConfig();

async function isApiKeyValid(): Promise<boolean> {
  // Since we run this on every invocation of vt, it makes sense to only check
  // if the api key is still valid every so often.

  const lastAuthAt = localStorage.getItem(AUTH_CACHE_LOCALSTORE_ENTRY);
  const hoursSinceLastAuth = lastAuthAt
    ? (new Date().getTime() - new Date(lastAuthAt).getTime())
    : Infinity;
  if (hoursSinceLastAuth < AUTH_CACHE_TTL) return true;

  const apiKey = Deno.env.get(API_KEY_KEY);
  if (!apiKey) return false;

  const resp = await fetch("https://api.val.town/v1/me", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (resp.ok) {
    localStorage.setItem(AUTH_CACHE_LOCALSTORE_ENTRY, new Date().toISOString());
    return true;
  }

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
      await onboardFlow();
    } else {
      await onboardFlow({ showWelcome: true });
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

async function startVt(...args: string[]) {
  const vt = (await import("~/cmd/root.ts")).cmd;
  await vt.parse([...Deno.args, ...args]);
}

if (import.meta.main) {
  await ensureValidApiKey();
  sdk.bearerToken = Deno.env.get(API_KEY_KEY) ?? sdk.bearerToken;
  await registerOutdatedWarning();
  await startVt();
}

export * from "./mod.ts";
