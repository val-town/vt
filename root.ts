import { Command } from "@cliffy/command";
import manifest from "./deno.json" with { type: "json" };

const cmd: Command = new Command().name("vt").version(manifest.version).action(
  () => {
    cmd.showHelp();
  },
);

export { cmd };
