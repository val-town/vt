import * as esbuild from "esbuild";
import { copy } from "@std/fs/copy";
import { denoPlugins } from "@duesabati/esbuild-deno-plugin";
import { resolve } from "@std/path";

const outputDir = "./dist";
const publicDir = "./public";

try {
  await Deno.remove(outputDir, { recursive: true });
} catch (e) {
  if (!(e instanceof Deno.errors.NotFound)) throw e;
}

const isDev = Deno.args.includes("--dev");

await esbuild.build({
  entryPoints: ["src/daemon.ts"],
  outdir: outputDir,
  bundle: true,
  minify: !isDev,
  format: "esm",
  loader: { ".svg": "dataurl" },
  define: { "window.IS_PRODUCTION": "true" },
  treeShaking: true,
  plugins: [
    ...denoPlugins({ configPath: resolve("../deno.json") }),
  ],
});

await copy(publicDir, outputDir, { overwrite: true });
esbuild.stop();
