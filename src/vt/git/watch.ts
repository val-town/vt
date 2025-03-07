import { shouldIgnore } from "~/vt/git/paths.ts";
import { debounce } from "@std/async/debounce";
import sdk from "~/sdk.ts";
import { basename, relative } from "@std/path";
import { DEFAULT_VAL_TYPE } from "~/consts.ts";
import { ensureValtownDir } from "~/vt/git/utils.ts";

/**
 * Watch a val town project directory for changes and sync them
 * unidirectionally with val town.
 *
 * @param args Options for watch operation.
 * @param {string} args.projectId The Val Town project ID.
 * @param {string} args.branchId The current branch ID of the project.
 * @param {string} args.targetDir The project root directory.
 * @param {string[]} args.ignoreGlobs A list of glob patterns for files to exclude.
 * @param {string?} args.watchCallback An additional callback for file system events. Returns whether to continue.
 */
// deno-lint-ignore require-await
export async function watch({
  projectId,
  branchId,
  targetDir,
  ignoreGlobs,
  watchCallback,
}: {
  projectId: string;
  branchId: string;
  targetDir: string;
  ignoreGlobs: string[];
  watchCallback?: (e: Deno.FsEvent) => boolean | void;
}): Promise<Deno.FsWatcher> {
  const watcher = Deno.watchFs(targetDir, { recursive: true });

  const handleEvent = debounce(async (event: Deno.FsEvent) => {
    if (watchCallback && !watchCallback(event)) return;

    // Skip events for ignored files
    if (shouldIgnore(event.paths[0], ignoreGlobs)) return;

    // Only process relevant events
    const path = event.paths[0];
    const vtPath = relative(targetDir, path);
    switch (event.kind) {
      case "create":
        ensureValtownDir(projectId, branchId, vtPath);
        await sdk.projects.files.create(projectId, vtPath, {
          branch_id: branchId,
          content: await Deno.readTextFile(path),
          type: getNewFileValType(path),
        });
        break;
      case "modify": // TODO
      case "remove": // TODO
    }
  }, 200);

  // Start running in background
  (async () => {
    for await (const event of watcher) handleEvent(event);
  })();

  return watcher;
}

function getNewFileValType(path: string) {
  if (/\.(ts|tsx|js|jsx)$/.test(basename(path))) {
    return DEFAULT_VAL_TYPE;
  } else {
    return "file";
  }
}
