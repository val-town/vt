import { Command } from "@cliffy/command";
import manifest from "../../deno.json" with { type: "json" };
import { cloneCmd } from "~/cmd/git.ts";

const cmd = new Command()
  .name("vt")
  .version(manifest.version)
  .action(
    () => cmd.showHelp,
  );

cmd.command("clone", cloneCmd);

export { cmd };
