import { colors } from "@cliffy/ansi/colors";
import { ENV_VAR_SET_FROM } from "@valtown/vt";

const MESSAGE_PREFIX = "Note that `vt` is using a `VAL_TOWN_API_KEY` ";

/**
 * An ANSI message indicating if the API key is being loaded from environment
 * variables/.env.
 */
export function authedWithEnvNote(
  { padding = "\n\n" }: { padding?: string } = {},
): string {
  switch (ENV_VAR_SET_FROM) {
    case "dotenv":
      return padding +
        colors.dim(MESSAGE_PREFIX + "found in a local .env file.");
    case "env":
      return padding +
        colors.dim(MESSAGE_PREFIX + "found as an environment variable.");
    default:
      return "";
  }
}
