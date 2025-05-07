import * as esbuild from "esbuild";
import * as fs from "fs/promises";
import * as path from "path";

const outputDir = "./dist";
const publicDir = "./public";

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function build() {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore if directory doesn't exist
  }

  const isDev = process.argv.includes("--dev");
  const browserType = process.argv.includes("firefox") ? "firefox" : "chrome";
  const manifestFile = browserType === "firefox"
    ? "manifest-firefox.json"
    : "manifest-chrome.json";

  await esbuild.build({
    entryPoints: ["src/daemon/main.ts", "src/content.ts"],
    outdir: outputDir,
    bundle: true,
    minify: !isDev,
    format: "esm",
    treeShaking: true,
  });

  await copyDir(publicDir, outputDir);
  await fs.copyFile(
    path.join(publicDir, manifestFile),
    path.join(outputDir, "manifest.json"),
  );
  await fs.copyFile(
    path.join(
      "node_modules",
      "webextension-polyfill",
      "dist",
      "browser-polyfill.js",
    ),
    path.join(outputDir, "browser-polyfill.js"),
  );

  esbuild.stop();
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
