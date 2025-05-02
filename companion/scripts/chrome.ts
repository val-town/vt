import { resolve } from "@std/path";

const extensionPath = resolve("dist");
const tempProfileDir = await Deno.makeTempDir({ prefix: "chrome-profile-" });
const chromePath = Deno.args[0];

const fullChromeCommandArgs = [
  "--user-data-dir=" + tempProfileDir,
  "--load-extension=" + extensionPath,
];

const command = new Deno
  .Command(chromePath, { args: fullChromeCommandArgs });

command.spawn();
