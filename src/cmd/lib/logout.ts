import { Command } from "@cliffy/command";
import { colors } from "@cliffy/ansi/colors";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTConfig from "~/vt/VTConfig.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { clearAuthCache } from "~/loginCache.ts";

export const logoutCmd = new Command()
  .name("logout")
  .description("Logout from Val Town by clearing stored credentials")
  .option("--local", "Clear credentials from local configuration only")
  .option("--global", "Clear credentials from global configuration only")
  .action(async ({ local, global }: { local?: boolean; global?: boolean }) => {
    try {
      if (local && global) {
        console.error(colors.red("Cannot specify both --local and --global flags"));
        Deno.exit(1);
      }

      await doWithSpinner("Clearing credentials...", async (spinner) => {
        // Find project root if we're in one
        const vtRoot = await findVtRoot(Deno.cwd()).catch(() => undefined);
        const vtConfig = new VTConfig(vtRoot);

        // Load current config
        const config = await vtConfig.loadConfig();

        // Create updated config with cleared credentials
        const updatedConfig = {
          ...config,
          apiKey: null,
          refreshToken: null,
        };

        const clearedFrom: string[] = [];

        // Clear from local config if requested or if no specific flag is given
        if (local || (!local && !global)) {
          if (vtRoot && await vtConfig.localConfigExists()) {
            await vtConfig.saveLocalConfig(updatedConfig);
            clearedFrom.push("local");
          } else if (local) {
            throw new Error(
              "Cannot clear local configuration - not in a Val Town project directory or no local config exists"
            );
          }
        }

        // Clear from global config if requested or if no specific flag is given
        if (global || (!local && !global)) {
          await vtConfig.saveGlobalConfig(updatedConfig);
          clearedFrom.push("global");
        }

        // Clear the authentication cache to force re-validation on next use
        await clearAuthCache();

        const locations = clearedFrom.join(" and ");
        spinner.succeed(`Cleared credentials from ${locations} configuration`);
      });

      console.log(colors.green("Successfully logged out from Val Town! 👋"));
    } catch (error) {
      console.error(colors.red("Logout failed:"), error instanceof Error ? error.message : String(error));
      Deno.exit(1);
    }
  });
