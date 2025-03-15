import { Command } from "@cliffy/command";
import VTClient from "~/vt/vt/VTClient.ts";
import { getLatestVersion } from "~/sdk.ts";
import { colors } from "@cliffy/ansi/colors";
import { FIRST_VERSION_NUMBER } from "~/consts.ts";

export const logCmd = new Command()
  .name("log")
  .description("Show branch version logs")
  .action(async () => {
    const vt = VTClient.from(Deno.cwd());
    const { currentBranch, projectId, version } = await vt
      .getMeta()
      .loadConfig();

    const latestVersion = await getLatestVersion(projectId, currentBranch);
    const versions = [FIRST_VERSION_NUMBER, version.toString()];
    if (version !== latestVersion) {
      versions.push(latestVersion.toString());
    }
    const formattedVersions = versions.map((v) =>
      v === version.toString() ? colors.green(v) : v
    );
     formattedVersions.join("..");
  });
