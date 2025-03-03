import { Command } from "@cliffy/command";
import manifest from "../../deno.json" with { type: "json" };
import { checkoutCmd, cloneCmd, pullCmd, statusCmd } from "~/cmd/git.ts";

const cmd = new Command()
  .name("vt")
  .version(manifest.version)
  .action(
    () => cmd.showHelp,
  );

cmd.command("clone", cloneCmd);
cmd.command("pull", pullCmd);
cmd.command("status", statusCmd);
cmd.command("checkout", checkoutCmd);

export { cmd };
