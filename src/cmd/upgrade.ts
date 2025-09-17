import { UpgradeCommand } from "@cliffy/command/upgrade";
import { JsrProvider } from "@cliffy/command/upgrade/provider/jsr";
import {
  JSR_ENTRY_NAME,
  SAW_AS_LATEST_VERSION,
  VT_MINIMUM_FLAGS,
} from "~/consts.ts";
import manifest from "../../deno.json" with { type: "json" };
import { colors } from "@cliffy/ansi/colors";

const provider = new JsrProvider({ package: JSR_ENTRY_NAME });
let didUpgrade = false;

export async function registerOutdatedWarning() {
  // If there is a new version, notify the user once (across runs) of that new version.
  const list = await provider.getVersions(JSR_ENTRY_NAME);
  const currentVersion = manifest.version;
  if (list.latest !== currentVersion) {
    const lastSawAsLatestVersion = localStorage.getItem(SAW_AS_LATEST_VERSION);
    if (lastSawAsLatestVersion !== list.latest && !didUpgrade) {
      addEventListener("unload", () => { // The last thing logged
        localStorage.setItem(SAW_AS_LATEST_VERSION, currentVersion);
        console.log(
          `A new version of vt is available: ${
            colors.bold(list.latest)
          }! Run \`${colors.bold("vt upgrade")}\` to update.`,
        );
      });
    }
  }
}

// @ts-ignore execute is private
class VTUpgradeCommand extends UpgradeCommand {
  // @ts-ignore execute is private
  async execute(options: Record<string, unknown>, args: unknown[]) {
    //@ts-ignore execute is private
    const result = await super.execute(options, args);
    didUpgrade = true;
    return result;
  }
}

export const upgradeCmd = new VTUpgradeCommand({
  main: ".",
  args: VT_MINIMUM_FLAGS,
  provider,
  spinner: true,
});
