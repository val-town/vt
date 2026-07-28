import * as esbuild from "esbuild";
import * as fs from "fs-extra";
import { watch } from "node:fs";
import { spawn } from "node:child_process";
import {
  outputDir,
  publicDir,
  getEsbuildOptions,
  copyStaticFiles,
} from "../build.js";

const browserType = "chrome";
const chromePath = process.argv[2] ?? "chromium";

async function main() {
  // Clean and copy static files once up front.
  await fs.emptyDir(outputDir);
  await copyStaticFiles(browserType);

  let launched = false;

  const ctx = await esbuild.context({
    ...getEsbuildOptions(true),
    plugins: [
      {
        name: "dev-launcher",
        setup(b) {
          b.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error("Build failed");
              return;
            }
            console.log("Build succeeded");
            // Launch Chrome once after the initial build settles.
            if (!launched) {
              launched = true;
              launchChrome();
            }
          });
        },
      },
    ],
  });

  await ctx.watch();
  console.log("Watching src/ for changes...");

  // Re-copy static files (manifest, assets, polyfill) when public/ changes.
  watch(publicDir, { recursive: true }, async () => {
    try {
      await copyStaticFiles(browserType);
      console.log("Static files re-copied");
    } catch (e) {
      console.error("Failed to re-copy static files:", e);
    }
  });

  const shutdown = async () => {
    await ctx.dispose();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function launchChrome() {
  console.log(`Launching Chrome (${chromePath})...`);
  spawn("node", ["scripts/chrome.js", chromePath], {
    stdio: "inherit",
    detached: true,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
