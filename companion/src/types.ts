import type chrome from "@types/chrome";

// deno-lint-ignore no-explicit-any
export const browserAPI = (globalThis as any).chrome as chrome;
