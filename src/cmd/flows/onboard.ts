import { colors } from "@cliffy/ansi/colors";
import {
  API_KEY_KEY,
  DEFAULT_WRAP_WIDTH,
  GLOBAL_VT_CONFIG_PATH,
  VT_README_URL,
} from "~/consts.ts";
import { ensureDir } from "@std/fs";
import wrap from "word-wrap";
import { globalConfig } from "~/vt/VTConfig.ts";
import { oicdLoginFlow } from "../../oauth.ts";

/**
 * Displays a welcome message that says what vt is and what it can do.
 */
function welcomeToVt(): void {
  console.log(colors.bold(colors.blue("Welcome to the Val Town CLI!")));
  console.log();

  console.log(wrap(
    colors.bold("VT") +
      " is a companion CLI to interface with Val Town Vals.",
    { width: DEFAULT_WRAP_WIDTH },
  ));
  console.log();

  console.log(wrap("With this CLI, you can:", { width: DEFAULT_WRAP_WIDTH }));

  [
    "Create and manage Val Town Vals",
    "Push and pull changes between your local system and Val Town",
    "Watch a directory to keep it automatically synced with Val Town",
    "And more!",
  ].forEach((feature) => {
    console.log(`  - ${feature}`);
  });
}

/**
 * The onboarding flow for users using vt for the first time. This handles
 * walking the user through authenticating via OAuth device authorization flow
 * and informing them on how to get started.
 *
 * OAuth is the default authentication method. Users who need to use an API
 * key directly (e.g., for CI environments) can use:
 *   `vt config set apiKey <key>`
 *
 * @param options Options for the onboarding flow
 * @param options.showWelcome Whether to show the welcome message
 */
export async function onboardFlow(
  options?: { showWelcome?: boolean },
): Promise<void> {
  options = options || {};

  if (options.showWelcome) {
    welcomeToVt();
    console.log();
  }

  console.log("  To get started, you need to authenticate with Val Town.");
  console.log();

  try {
    const tokens = await oicdLoginFlow();

    // Set the API key in the environment for the current session
    Deno.env.set(API_KEY_KEY, tokens.access_token);

    // Ensure the global config directory exists
    await ensureDir(GLOBAL_VT_CONFIG_PATH);

    // Add the API key to the config
    await globalConfig.saveGlobalConfig({
      apiKey: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });

    console.log(colors.green("API key saved to global config file!"));
    console.log(
      "To learn how to get started, " +
        `head over to ${VT_README_URL}`,
    );
    console.log();
  } catch (error) {
    // If the device auth flow fails (e.g., no browser, network issues),
    // fall back to showing the manual API key instructions.
    console.log();
    console.log(
      colors.yellow(
        "Automatic login failed" +
          (error instanceof Error ? `: ${error.message}` : "."),
      ),
    );
    console.log();
    console.log(
      "You can authenticate manually by running:\n" +
        colors.cyan("  vt login") +
        "\n\nor by setting an API key directly:\n" +
        colors.cyan("  vt config set apiKey <your API key>") +
        "\n\nYou can generate an API key at " +
        colors.cyan("https://www.val.town/settings/api") +
        " with user read, val read + write, telemetry read permissions.",
    );
  }
}
