import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import { doWithSpinner } from "~/cmd/utils.ts";
import sdk, { getCurrentUser } from "~/sdk.ts";
import wrap from "word-wrap";
import { ansi } from "@cliffy/ansi";

export const profileCmd = new Command()
  .name("profile")
  .alias("me")
  .description("Get information about the currently authenticated user")
  .action(async () => {
    await doWithSpinner("Creating new Val...", async (spinner) => {
      const user = await getCurrentUser();
      spinner.stop();
      console.log(
        `You're logged in as @${
          ansi.link( // terminal code for link
            colors.bold(user.username!),
            user.url,
          )
        }`,
      ); // usernames no longer can be null but the schema isn't updated yet

      if (user.bio) {
        console.log(colors.dim(wrap(`"${user.bio}"`)));
      }

      if (user.tier === "pro") {
        console.log(
          `You're on the ${colors.yellow(colors.bold("Pro"))} plan. 🚀`,
        );
      } else {
        console.log(
          `You're on the ${
            colors.yellow(colors.bold("free"))
          } plan. Head over to https://www.val.town/pricing to sign up for pro for custom domains, unlimited private Vals, and more!`,
        );
      }

      const orgs = await sdk.
    });
  });
