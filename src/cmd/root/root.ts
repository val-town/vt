import { Command } from "@cliffy/command";
import manifest from "../../../deno.json" with { type: "json" };
import * as cmds from "~/cmd/git/index.ts";
import { createCmd } from "~/cmd/root/create.ts";

const cmd = new Command()
  .name("vt")
  .version(manifest.version)
  .help({ colors: Deno.stdout.isTerminal() })
  .action(() => cmd.showHelp());

cmd.command("clone", gitCmds.cloneCmd);
cmd.command("pull", gitCmds.pullCmd);
cmd.command("status", gitCmds.statusCmd);
cmd.command("branch", gitCmds.branchCmd);
cmd.command("checkout", gitCmds.checkoutCmd);
cmd.command("create", createCmd);
cmd.command("log", logCmd);

export { cmd };
