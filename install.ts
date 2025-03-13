// This file must be https importable, don't use any imports that are in the
// deno.json import map.

// Update this if we need to pull a new deno.json
const installVersion = "0.0.1-alpha.1";

import { ensureDir } from "jsr:@std/fs@^1.0.13";
const appName = "vt";
const cacheDir = await setupCacheDir(appName);
const vtDenoJsonPath = `${cacheDir}/${installVersion}_deno.json`;

// Find the cache directory based on the OS
async function setupCacheDir(appName: string): Promise<string> {
  const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
  let cacheDir = "";
  if (Deno.build.os === "windows") {
    cacheDir = `${homeDir}\\AppData\\Local\\${appName}`;
  } else if (Deno.build.os === "darwin") {
    cacheDir = `${homeDir}/Library/Caches/${appName}`;
  } else {
    // Linux and others
    const xdgCacheHome = Deno.env.get("XDG_CACHE_HOME");
    cacheDir = xdgCacheHome
      ? `${xdgCacheHome}/${appName}`
      : `${homeDir}/.cache/${appName}`;
  }

  await ensureDir(cacheDir);

  return cacheDir;
}

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
    "--allow-env=VAL_TOWN_API_KEY",
    "--allow-env=VAL_TOWN_BASE_URL",
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
