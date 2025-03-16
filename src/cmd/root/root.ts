import { Command } from "@cliffy/command";
import manifest from "../../../deno.json" with { type: "json" };
import * as gitCmds from "~/cmd/git/mod.ts";
import { createCmd } from "~/cmd/root/create.ts";
import { watchCmd } from "~/cmd/watch.ts";

const cmd = new Command()
  .name("vt")
  .version(manifest.version)
  .help({ colors: Deno.stdout.isTerminal() })
  .action(() => cmd.showHelp());

cmd.command("clone", gitCmds.cloneCmd);
cmd.command("push", gitCmds.pushCmd);
cmd.command("pull", gitCmds.pullCmd);
cmd.command("status", gitCmds.statusCmd);
cmd.command("branch", gitCmds.branchCmd);
cmd.command("checkout", gitCmds.checkoutCmd);
cmd.command("watch", watchCmd);
cmd.command("create", createCmd);

export { cmd };
