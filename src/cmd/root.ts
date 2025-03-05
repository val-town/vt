import { Command } from "@cliffy/command";
import manifest from "../../deno.json" with { type: "json" };
import { cloneCmd, pullCmd, stashCmd, statusCmd } from "~/cmd/git.ts";

const cmd = new Command()
  .name("vt")
  .version(manifest.version)
  .action(
    () => cmd.showHelp,
  );

cmd.command("clone", cloneCmd);
cmd.command("pull", pullCmd);
cmd.command("status", statusCmd);
cmd.command("stash", stashCmd);

export { cmd };
