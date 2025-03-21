#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net --allow-sys --allow-run
import { onboardFlow } from "~/cmd/flows/onboard.ts";
import VTConfig from "~/vt/config.ts";
import { API_KEY_KEY } from "~/consts.ts";

if (import.meta.main) {
  try {
    if (!Deno.env.get(API_KEY_KEY)) {
      const config = new VTConfig(Deno.cwd());
      const { apiKey } = await config.loadConfig();
      Deno.env.set(API_KEY_KEY, apiKey);
    }

    const vt = (await import("~/cmd/root.ts")).cmd;
    await vt.parse(Deno.args);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      await onboardFlow();
    } else throw error;
  }
}
