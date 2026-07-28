import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs-extra";
import { fileURLToPath } from "node:url";

export const outputDir = "./dist";
export const publicDir = "./public";

export function getEsbuildOptions(isDev) {
  return {
    entryPoints: ["src/daemon/main.ts", "src/content.ts"],
    outdir: outputDir,
    bundle: true,
    minify: !isDev,
    format: "esm",
    treeShaking: true,
  };
}

export async function copyStaticFiles(browserType) {
  const manifestFile = browserType === "firefox"
    ? "manifest-firefox.json"
    : "manifest-chrome.json";

  // Copy public files and manifest
  await fs.copy(publicDir, outputDir);
  await fs.copy(
    path.join(publicDir, manifestFile),
    path.join(outputDir, "manifest.json"),
  );

  // Copy browser polyfill
  await fs.copy(
    path.join(
      "node_modules",
      "webextension-polyfill",
      "dist",
      "browser-polyfill.js",
    ),
    path.join(outputDir, "browser-polyfill.js"),
  );
}

async function build() {
  // Clean up the output directory
  await fs.emptyDir(outputDir);

  const isDev = process.argv.includes("--dev");
  const browserType = process.argv.includes("firefox") ? "firefox" : "chrome";

  // Build the extension
  await esbuild.build(getEsbuildOptions(isDev));
  await copyStaticFiles(browserType);

  console.log(`Build completed for ${browserType} browser`);
  esbuild.stop();
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  build().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
