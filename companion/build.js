import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs-extra";
import klaw from "klaw";

const outputDir = "./dist";
const publicDir = "./public";

async function build() {
  // Clean up the output directory
  await fs.emptyDir(outputDir);

  const isDev = process.argv.includes("--dev");
  const browserType = process.argv.includes("firefox") ? "firefox" : "chrome";
  const manifestFile = browserType === "firefox"
    ? "manifest-firefox.json"
    : "manifest-chrome.json";

  // Build the extension
  await esbuild.build({
    entryPoints: ["src/daemon/main.ts", "src/content.ts"],
    outdir: outputDir,
    bundle: true,
    minify: !isDev,
    format: "esm",
    treeShaking: true,
  });

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

  console.log(`Build completed for ${browserType} browser`);
}

async function prependToFile(filePath, content) {
  try {
    const originalContent = await fs.readFile(filePath, "utf8");
    await fs.writeFile(filePath, content + originalContent);
    console.log(`Prepended content to ${filePath}`);
  } catch (error) {
    console.error(`Error prepending to ${filePath}:`, error);
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});

esbuild.stop();
