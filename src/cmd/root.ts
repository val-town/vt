import { Command } from "@cliffy/command";
import manifest from "../../deno.json" with { type: "json" };
import * as cmds from "~/cmd/lib/mod.ts";

const cmd = new Command()
  .name("vt")
  .version(manifest.version)
  .help({ colors: Deno.stdout.isTerminal() })
  .action(() => cmd.showHelp());

cmd.command("clone", cmds.cloneCmd);
cmd.command("push", cmds.pushCmd);
cmd.command("pull", cmds.pullCmd);
cmd.command("status", cmds.statusCmd);
cmd.command("branch", cmds.branchCmd);
cmd.command("checkout", cmds.checkoutCmd);
cmd.command("watch", cmds.watchCmd);
cmd.command("browse", cmds.browseCmd);
cmd.command("create", cmds.createCmd);
cmd.command("config", cmds.configCmd);

export { cmd };
