#!/usr/bin/env -S deno run -A
import { Confirm } from "@cliffy/prompt";
import { Secret } from "@cliffy/prompt/secret";
import { colors } from "@cliffy/ansi/colors";
import open from "open";

if (Deno.env.get("VAL_TOWN_API_KEY") === undefined) {
  console.log(
    colors.red(
      "API key is not set! " +
        colors.bold("VAL_TOWN_API_KEY") +
        " must be set to use " +
        colors.bold("`vt`"),
    ),
  );
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

  // Set the API key in the environment
  Deno.env.set("VAL_TOWN_API_KEY", apiKey);

  console.log(colors.green("API key set successfully!"));
  console.log();
  console.log(
    "Note: This key is only set for the current session. To make it permanent, add it to your environment with:" +
      "\n  `export VAL_TOWN_API_KEY=" + apiKey + "`" +
      "\nor add it to your .env file.",
  );
  console.log();
}

if (import.meta.main) {
  const vt = (await import("~/cmd/root.ts")).cmd;
  await vt.parse(Deno.args);
}
