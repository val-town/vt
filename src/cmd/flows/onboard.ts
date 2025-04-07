import { Confirm } from "@cliffy/prompt";
import { Secret } from "@cliffy/prompt/secret";
import { colors } from "@cliffy/ansi/colors";
import open from "open";
import {
  GET_API_KEY_URL,
  GLOBAL_VT_CONFIG_PATH,
  VT_README_URL,
} from "~/consts.ts";
import { ensureDir } from "@std/fs";
import wrap from "word-wrap";
import { globalConfig } from "~/vt/VTConfig.ts";
import { delay } from "@std/async";

/**
 * Displays a welcome message that says what vt is and what it can do.
 */
function welcomeToVt(): void {
  console.log(colors.bold(colors.blue("Welcome to the Val Town CLI!")));
  console.log();

  console.log(wrap(
    colors.bold("VT") +
      " is a companion CLI to interface with Val Town projects.",
    { width: 80 },
  ));
  console.log();

  console.log(wrap("With this CLI, you can:", { width: 80 }));

  [
    "Create and manage Val Town projects",
    "Push and pull changes between your local system and Val Town",
    "Watch a directory to keep it automatically synced with Val Town",
    "And more!",
  ].forEach((feature) => {
    console.log(`  - ${feature}`);
  });
}

/**
 * The onboarding flow for users using vt for the first time. This handles
 * walking the user through setting their API key and informing them on how to
 * get started.
 */
export async function onboardFlow(): Promise<void> {
  welcomeToVt();
  console.log();

  console.log("  To get started, you need to authenticate with Val Town.");
  console.log();

  const goToWebsite: boolean = await Confirm.prompt({
    message:
      `Would you like to open val.town/settings/api in a browser to get an API key?`,
  });

  if (goToWebsite) {
    console.log("Ensure you select user read & project read+write permissions");
    await delay(500);
    await open(GET_API_KEY_URL);
    console.log(`Browser opened to ${GET_API_KEY_URL}`);
  } else {
    console.log();
    console.log(
      "You can get an API key at " + GET_API_KEY_URL +
        " with project read/write permissions",
    );
  }

  console.log();
  const apiKey = await Secret.prompt({
    message: "Please enter your Val Town API key:",
    validate: (input) => {
      if (input.length !== 33) {
        return "API key must be exactly 33 characters long";
      }
      return true;
    },
  });

  // Set the API key in the environment for the current session
  Deno.env.set("VAL_TOWN_API_KEY", apiKey);

  // Ensure the global config directory exists
  await ensureDir(GLOBAL_VT_CONFIG_PATH);

  // Add the API key to the config
  globalConfig.saveGlobalConfig({ apiKey });

  console.log(colors.green("API key saved to global config file!"));
  console.log(
    "To learn how to get started, " +
      `head over to ${VT_README_URL}`,
  );
  console.log();
}
