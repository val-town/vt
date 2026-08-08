import { Command } from "@cliffy/command";
import { CompletionsCommand } from "@cliffy/command/completions";
import manifest from "../../deno.json" with { type: "json" };
import * as cmds from "~/cmd/lib/mod.ts";
import { upgradeCmd } from "./upgrade.ts";
import { CLAUDE_CODE_PLUGIN_HINT, PLUGIN_RECOMMENDATION } from "~/consts.ts";

const cmd = new Command()
  .name("vt")
  .version(manifest.version)
  .help({ colors: Deno.stdout.isTerminal() })
  .action(() => cmd.showHelp());

// Append a plugin recommendation whenever the top-level help is shown. Cliffy
// prints the help on a bare `vt`, on `--help`, and on an unknown command, so
// this is a low-frequency surface that reliably reaches AI agents reaching for
// the CLI. We print the note ourselves (always to stdout) rather than baking it
// into the help body, which Cliffy routes to stderr on the unknown-command path.
const showHelp = cmd.showHelp.bind(cmd);
cmd.showHelp = (options) => {
  showHelp(options);
  console.log("\n" + PLUGIN_RECOMMENDATION);

  // When running inside Claude Code, emit a plugin install hint on its own line
  // to stderr. Claude Code detects this marker, strips it from the output before
  // the model sees it, and prompts the user once to install the official Val
  // Town plugin. It is gated on CLAUDECODE so it never reaches a human terminal,
  // and goes to stderr so it stays out of stdout pipelines.
  // https://code.claude.com/docs/en/plugin-hints
  if (Deno.env.get("CLAUDECODE")) {
    console.error(CLAUDE_CODE_PLUGIN_HINT);
  }
};

cmd.command("profile", cmds.profileCmd);
cmd.command("upgrade", upgradeCmd);
cmd.command("clone", cmds.cloneCmd);
cmd.command("push", cmds.pushCmd);
cmd.command("pull", cmds.pullCmd);
cmd.command("status", cmds.statusCmd);
cmd.command("branch", cmds.branchCmd);
cmd.command("checkout", cmds.checkoutCmd);
cmd.command("watch", cmds.watchCmd);
cmd.command("browse", cmds.browseCmd);
cmd.command("create", cmds.createCmd);
cmd.command("remix", cmds.remixCmd);
cmd.command("config", cmds.configCmd);
cmd.command("delete", cmds.deleteCmd);
cmd.command("list", cmds.listCmd);
cmd.command("tail", cmds.tailCmd);
cmd.command("login", cmds.loginCmd);
cmd.command("logout", cmds.logoutCmd);
cmd.command("completions", new CompletionsCommand());

export { cmd };
