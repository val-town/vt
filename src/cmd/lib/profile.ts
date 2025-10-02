import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import { doWithSpinner } from "~/cmd/utils.ts";
import sdk, { getCurrentUser } from "~/sdk.ts";
import wrap from "word-wrap";
import { ansi } from "@cliffy/ansi";

export const profileCmd = new Command()
  .name("profile")
  .alias("me")
  .description("Get information about the currently authenticated user (you!)")
  .action(async () => {
    await doWithSpinner("Loading profile information...", async (spinner) => {
      const user = await getCurrentUser();

      // TODO: Use the async generator when we change this to `.list`
      const orgNames: string[] = [];
      let cursor = 0;
      do {
        const res = await sdk.orgs.retrieve({ limit: 100, offset: cursor });
        res.data.map((o) => o.username).forEach((name) => orgNames.push(name));
        cursor += res.data.length;
      } while (orgNames.length < cursor && cursor < 1000);

      spinner.stop();

      let currentlyLoggedInMsg = `You're logged in as @${
        ansi.link( // terminal code for link
          colors.bold(user.username!), // we made this non-null but it hasn't propagated
          user.url,
        )
      }`;
      if (orgNames.length > 0) {
        currentlyLoggedInMsg += ` and a member of ${
          colors.bold(
            orgNames.map((n) => ansi.link(`@${n}`, orgUsernameToOrgLink(n)))
              .join(", "),
          )
        }`;
      }
      currentlyLoggedInMsg += ".";
      console.log(currentlyLoggedInMsg);

      if (user.bio) {
        console.log(colors.dim(wrap(`"${user.bio}"`)));
      }

      if (user.tier === "pro") {
        console.log(
          `Thank you for being a ${colors.yellow(colors.bold("Pro"))} member! 🚀`,
        );
      } else {
        console.log(
          `You're on the ${
            colors.yellow(colors.bold("free"))
          } plan. Head over to https://www.val.town/pricing to sign up for pro for custom domains, unlimited private Vals, and more!`,
        );
      }
    });
  });

function orgUsernameToOrgLink(orgUsername: string) {
  return `https://www.val.town/orgs/${orgUsername}`;
}
