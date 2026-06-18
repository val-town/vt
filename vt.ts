#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net --allow-sys --allow-run
import "@std/dotenv/load";
import { ensureGlobalVtConfig, globalConfig } from "~/vt/VTConfig.ts";
import { onboardFlow } from "~/cmd/flows/onboard.ts";
import {
  API_KEY_KEY,
  AUTH_CACHE_TTL,
  VAL_TOWN_API_BASE_URL,
} from "~/consts.ts";
import { colors } from "@cliffy/ansi/colors";
import sdk from "~/sdk.ts";
import { registerOutdatedWarning } from "~/cmd/upgrade.ts";
import { refreshTokens } from "~/oauth.ts";
import { getLastAuthCheck, setAuthCacheValid } from "~/loginCache.ts";

await ensureGlobalVtConfig();

async function isApiKeyValid(): Promise<boolean> {
  // Since we run this on every invocation of vt, it makes sense to only check
  // if the api key is still valid every so often.
  const lastAuthAt = await getLastAuthCheck();
  const hoursSinceLastAuth = lastAuthAt
    ? new Date().getTime() - lastAuthAt.getTime()
    : Infinity;
  if (hoursSinceLastAuth < AUTH_CACHE_TTL) return true;

  const apiKey = Deno.env.get(API_KEY_KEY);
  if (!apiKey) return false;

  const resp = await fetch(`${VAL_TOWN_API_BASE_URL}/v1/me`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (resp.ok) {
    await setAuthCacheValid();
    return true;
  }

  return resp.status !== 401;
}

async function ensureValidApiKey() {
  if (Deno.env.has(API_KEY_KEY) && (await isApiKeyValid())) return;

  {
    const { apiKey, refreshToken } = await globalConfig.loadConfig();
    if (apiKey) {
      Deno.env.set(API_KEY_KEY, apiKey);

      // Validate the loaded key
      if (await isApiKeyValid()) return;

      // Attempt to refresh if there is a refresh token
      if (refreshToken) {
        try {
          const newTokens = await refreshTokens(refreshToken);
          await globalConfig.saveGlobalConfig({
            apiKey: newTokens.access_token,
            refreshToken: newTokens.refresh_token,
          });
          Deno.env.set(API_KEY_KEY, newTokens.access_token);
          if (await isApiKeyValid()) return;
        } catch {
          // Refresh failed (expired/revoked refresh token, network error, etc.)
          // Fall through to re-login
        }
      }

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

/**
 * Whether the invocation only produces help or version output, which never
 * needs a network round trip. Skipping auth for these keeps `vt`, `vt --help`,
 * `vt --version`, and unknown/typo'd commands working (and showing the plugin
 * recommendation) without first hitting an auth wall — which matters for agents
 * that haven't configured a key yet.
 */
function isHelpOnlyInvocation(
  args: string[],
  knownCommands: Set<string>,
): boolean {
  const first = args[0];
  if (!first) return true; // bare `vt` prints the help
  if (["-h", "--help", "-V", "--version"].includes(first)) return true;
  // A leading non-flag token that isn't a known command makes Cliffy print the
  // help (and then error), so it needs no auth either.
  if (!first.startsWith("-") && !knownCommands.has(first)) return true;
  return false;
}

if (import.meta.main) {
  if (Deno.env.get("CI") !== "true") {
    await registerOutdatedWarning();
  }

  // Importing here resolves the same cached module that startVt() uses; we read
  // the registered command names to decide whether auth is needed.
  const { cmd } = await import("~/cmd/root.ts");
  const knownCommands = new Set(cmd.getCommands().map((c) => c.getName()));

  if (
    !isHelpOnlyInvocation(Deno.args, knownCommands) &&
    !["logout"].includes(Deno.args[0])
  ) {
    await ensureValidApiKey();
  }

  sdk.bearerToken = Deno.env.get(API_KEY_KEY) ?? sdk.bearerToken;
  await startVt();
}

export * from "./mod.ts";
