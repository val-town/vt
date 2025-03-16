// This file must be https importable, don't use any imports that are in the
// deno.json import map.
import xdg from "https://deno.land/x/xdg_portable@v10.6.0/src/mod.deno.ts";
import { ensureDir } from "jsr:@std/fs@^1.0.13";
import { join } from "jsr:@std/path@^1.0.8";

// Update this if we need to pull a new deno.json
const installVersion = "0.0.1-alpha.1";

const appName = "vt";
const cacheDir = Deno.env.get("VT_CACHE_DIR") || join(xdg.cache(), appName);
await ensureDir(cacheDir);
const vtDenoJsonPath = join(cacheDir, `${installVersion}_deno.json`);

// Write deno.json to the cache directory if it doesn't exist
try {
  await Deno.stat(vtDenoJsonPath);
  // File exists, no need to download
} catch (error) {
  if (error instanceof Deno.errors.NotFound) {
    const denoJson = await fetch(
      import.meta.resolve("./deno.json"),
    );

    let denoJsonText = await denoJson.text();
    // Replace the relative path with the path to the http module we're importing from.
    denoJsonText = denoJsonText.replace(
      "./src/",
      import.meta.resolve("./src/"),
    );
    await Deno.writeTextFile(vtDenoJsonPath, denoJsonText);
  } else {
    throw error;
  }
}

// Run the vt.ts script with all arguments passed to this script
const process = new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "--allow-read",
    "--allow-write",
    "--allow-sys=osRelease",
    "--allow-env=VAL_TOWN_API_KEY,VAL_TOWN_BASE_URL",
    "--allow-net",
    "--allow-run",
    "--config",
    vtDenoJsonPath,
    import.meta.resolve("./vt.ts"),
    ...Deno.args,
  ],
  stdout: "inherit",
  stderr: "inherit",
});

const { code } = await process.output();
Deno.exit(code);
