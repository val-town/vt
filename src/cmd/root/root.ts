import { Command } from "@cliffy/command";
import manifest from "../../../deno.json" with { type: "json" };
import * as cmds from "~/cmd/git/index.ts";
import { createCmd } from "~/cmd/root/create.ts";

const cmd = new Command()
  .name("vt")
  .version(manifest.version)
  .help({ colors: Deno.stdout.isTerminal() })
  .action(() => cmd.showHelp());

cmd.command("clone", cmds.cloneCmd);
cmd.command("pull", cmds.pullCmd);
cmd.command("status", cmds.statusCmd);
cmd.command("branch", cmds.branchCmd);
cmd.command("checkout", cmds.checkoutCmd);
cmd.command("create", createCmd);

export { cmd };
