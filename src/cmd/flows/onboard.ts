import { Confirm } from "@cliffy/prompt";
import { Secret } from "@cliffy/prompt/secret";
import { colors } from "@cliffy/ansi/colors";
import open from "open";
import { GLOBAL_VT_CONFIG_PATH, JSON_INDENT_SPACES } from "~/consts.ts";
import { ensureDir, exists } from "@std/fs";
import wrap from "word-wrap";
import VTConfig from "~/vt/config.ts";

/**
 * Displays a welcome message for new Val Town CLI users
 */
function welcomeToVt(): void {
  // Header
  console.log(colors.bold(colors.blue("Welcome to Val Town CLI!")));
  console.log();

  // Introduction
  console.log(wrap(
    colors.bold("VT") +
      " is a companion CLI to interface with Val Town projects.",
    { width: 80 },
  ));
  console.log();

  // Features list
  console.log(wrap("With this CLI, you can:", { width: 80 }));

  const features = [
    "Create and manage Val Town projects",
    "Push and pull changes between your local system and Val Town",
    "Watch a directory to keep it automatically synced with Val Town",
    "And more!",
  ];

  features.forEach((feature) => {
    console.log(`  - ${feature}`);
  });
}

/**
 * Handles the onboarding flow for setting up the Val Town API key
 * Guides the user through obtaining and saving an API key
 *
 * @returns {Promise<>} The API key that was set
 */
export async function onboardFlow(): Promise<void> {
  welcomeToVt();
  console.log();

  const goToWebsite: boolean = await Confirm.prompt({
    message:
      `Would you like to open val.town/settings/api in a browser to get an API key?`,
  });

  if (goToWebsite) {
    await open("https://www.val.town/settings/api");
    console.log("Browser opened to https://www.val.town/settings/api");
  } else {
    console.log();
    console.log(
      "You can get an API key at https://www.val.town/settings/api with project read/write permissions",
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

  // Create a config instance using the global path
  const config = new VTConfig(Deno.cwd());

  // Ensure the global config directory exists
  await ensureDir(GLOBAL_VT_CONFIG_PATH);

  // Load existing config or create a new one
  let configData: Record<string, unknown> = {};
  const globalConfigPath = config.getGlobalConfigPath();

  if (await exists(globalConfigPath)) {
    const existingConfig = await Deno.readTextFile(globalConfigPath);
    configData = JSON.parse(existingConfig);
  }

  // Add the API key to the config
  configData.apiKey = apiKey;

  // Write the updated config
  await Deno.writeTextFile(
    globalConfigPath,
    JSON.stringify(configData, null, JSON_INDENT_SPACES),
  );

  console.log(colors.green("API key saved to global config file!"));
  console.log();
}
