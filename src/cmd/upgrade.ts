import { UpgradeCommand } from "@cliffy/command/upgrade";
import { JsrProvider } from "@cliffy/command/upgrade/provider/jsr";
import {
  JSR_ENTRY_NAME,
  SAW_AS_LATEST_VERSION,
  VT_MINIMUM_FLAGS,
} from "~/consts.ts";
import manifest from "../../deno.json" with { type: "json" };
import { colors } from "@cliffy/ansi/colors";
import { vtState } from "../vt/VTState.ts";

const provider = new JsrProvider({ package: JSR_ENTRY_NAME });

export async function registerOutdatedWarning() {
  // If there is a new version, notify the user once (across runs) of that new version.
  const list = await provider.getVersions(JSR_ENTRY_NAME);
  const currentVersion = manifest.version;
  if (list.latest !== currentVersion) {
    const lastSawAsLatestVersion = await vtState.getItem(SAW_AS_LATEST_VERSION);
    if (lastSawAsLatestVersion !== list.latest) {
      addEventListener("unload", async () => {
        // The last thing logged
        if (Deno.args.includes("upgrade")) return; // Don't show when they are upgrading

        await vtState.setItem(SAW_AS_LATEST_VERSION, currentVersion);
        console.log(
          `A new version of vt is available: ${
            colors.bold(
              list.latest,
            )
          }! Run \`${colors.bold("vt upgrade")}\` to update.`,
        );
      });
    }
  }
}

export const upgradeCmd = new UpgradeCommand({
  main: ".",
  args: VT_MINIMUM_FLAGS,
  provider,
  spinner: true,
});
