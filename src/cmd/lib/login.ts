import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import { doWithSpinner } from "~/cmd/utils.ts";
import { loggedInInSession, oicdLoginFlow } from "~/oauth.ts";
import VTConfig from "~/vt/VTConfig.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { setAuthCacheValid } from "~/loginCache.ts";

export const loginCmd = new Command()
  .name("login")
  .description("Login to Val Town using your browser")
  .option(
    "--local",
    "Save credentials to local configuration instead of global",
  )
  .action(async ({ local }: { local?: boolean }) => {
    try {
      if (loggedInInSession) {
        return;
      }

      // Perform the OIDC login flow
      const tokens = await oicdLoginFlow();

      if (!tokens.access_token) {
        console.error(colors.red("Failed to obtain access token"));
        Deno.exit(1);
      }

      await doWithSpinner("Saving credentials...", async (spinner) => {
        // Find project root if we're in one
        const vtRoot = await findVtRoot(Deno.cwd()).catch(() => undefined);
        const vtConfig = new VTConfig(vtRoot);

        // Load current config
        const config = await vtConfig.loadConfig();

        // Update with new tokens
        const updatedConfig = {
          ...config,
          apiKey: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
        };

        // Save to either global or local config based on flag
        if (local) {
          if (!vtRoot) {
            throw new Error(
              "Cannot save local configuration - not in a Val Town project directory",
            );
          }
          await vtConfig.saveLocalConfig(updatedConfig);
          spinner.succeed("Saved credentials to local configuration");
        } else {
          await vtConfig.saveGlobalConfig(updatedConfig);
          spinner.succeed("Saved credentials to global configuration");
        }

        // Mark the authentication as valid in cache
        await setAuthCacheValid();
      });

      console.log(colors.green("Successfully logged in to Val Town! 🎉"));
    } catch (error) {
      console.error(
        colors.red("Login failed:"),
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
