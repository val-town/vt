import { Command } from "@cliffy/command";
import { UpgradeCommand } from "@cliffy/command/upgrade";
import { JsrProvider } from "@cliffy/command/upgrade/provider/jsr";
import {
  JSR_ENTRY_NAME,
  SAW_IS_OUTDATED_FOR,
  VT_MINIMUM_FLAGS,
} from "~/consts.ts";
import manifest from "../../deno.json" with { type: "json" };
import { colors } from "@cliffy/ansi/colors";

const provider = new JsrProvider({ package: JSR_ENTRY_NAME });

const list = await provider.getVersions(JSR_ENTRY_NAME);
const currentVersion = manifest.version;
if (list.latest !== currentVersion) {
  const lastSawOutdatedFor = localStorage.getItem(SAW_IS_OUTDATED_FOR);
  if (lastSawOutdatedFor !== currentVersion) {
    addEventListener("unload", () => { // The last thing logged
      localStorage.setItem(SAW_IS_OUTDATED_FOR, currentVersion);
      console.log(
        `A new version of vt is available: ${colors.bold(list.latest)}! Run \`${
          colors.bold("vt upgrade")
        }\` to update.`,
      );
    });
  }
}

export const upgradeCmd = new Command()
  .command(
    "upgrade",
    new UpgradeCommand({
      main: ".",
      args: VT_MINIMUM_FLAGS,
      provider,
      spinner: true,
    }),
  );
