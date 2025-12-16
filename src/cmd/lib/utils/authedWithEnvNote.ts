import { colors } from "@cliffy/ansi/colors";
import { exists } from "@std/fs";
import { API_KEY_KEY } from "~/consts.ts";

const MESSAGE_PREFIX = "Note that `vt` is using a `VAL_TOWN_API_KEY`.";

/**
 * Returns a dimmed message indicating if the API key is being loaded from environment variables.
 * Checks for VAL_TOWN_API_KEY and whether it's from a .env file or system
 * environment and provides a useful diagnostic.
 *
 * @returns A formatted message string, or empty string if no API key is found in environment.
 */
export async function authedWithEnvNote(): Promise<string> {
  if (Deno.env.has(API_KEY_KEY)) {
    if (await exists(".env")) {
      return colors.dim(MESSAGE_PREFIX + "found in a local .env file");
    } else {
      return colors.dim(MESSAGE_PREFIX + "found as an environment variables");
    }
  }
  return "";
}
