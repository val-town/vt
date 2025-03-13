


// Find the cache directory based on the OS

function setupCacheDir(appName: string): string {
    const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
    let cacheDir = "";
  if (Deno.build.os === "windows") {
    cacheDir = `${homeDir}\\AppData\\Local\\${appName}`;
  } else if (Deno.build.os === "darwin") {
    cacheDir = `${homeDir}/Library/Caches/${appName}`;
  } else {
    // Linux and others
    const xdgCacheHome = Deno.env.get("XDG_CACHE_HOME");
    cacheDir = xdgCacheHome ? `${xdgCacheHome}/${appName}` : `${homeDir}/.cache/${appName}`;
  }

  // Create the directory in the cache dir if it doesn't exist
  try {
    Deno.mkdirSync(cacheDir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }

  return cacheDir;
}

const appName = "vt";
const cacheDir = setupCacheDir(appName);

// Write deno.json to the cache directory if it doesn't exist
const vtDenoJsonPath = `${cacheDir}/deno.json`;

try {
  await Deno.stat(vtDenoJsonPath);
  // File exists, no need to download
} catch (error) {
  if (error instanceof Deno.errors.NotFound) {
    const denoJson = await fetch(
      import.meta.resolve("./deno.json")
    );

    const denoJsonText = await denoJson.text();
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
    "--allow-env",
    "--allow-net",
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







