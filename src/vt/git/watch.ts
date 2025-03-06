import type { StatusResult } from "~/vt/git/status.ts";
import { shouldIgnore } from "~/vt/git/paths.ts";

/**
 * Watch a val town project directory for changes and sync them
 * unidirectionally with val town.
 *
 * @param args Options for watch operation.
 * @param {string} args.targetDir The vt project root directory.
 * @param {string[]} args.ignoreGlobs A list of glob patterns for files to exclude.
 * @param {(status: StatusResult) => void} [args.onStatusChange] Optional callback for status changes.
 * @param {(path: string) => void} [args.onCreate] Optional callback for file creation events.
 * @param {(path: string) => void} [args.onModify] Optional callback for file modification events.
 * @param {(path: string) => void} [args.onRemove] Optional callback for file removal events.
 */
export async function watch({
  targetDir,
  ignoreGlobs,
  onCreate,
  onModify,
  onRemove,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  ignoreGlobs: string[];
  onStatusChange?: (status: StatusResult) => void;
  onCreate?: (path: string) => void;
  onModify?: (path: string) => void;
  onRemove?: (path: string) => void;
}): Promise<void> {
  const watcher = Deno.watchFs(targetDir, { recursive: true });

  for await (const event of watcher) {
    // Skip events for ignored files
    if (shouldIgnore(event.paths[0], ignoreGlobs)) continue;

    // Only process relevant events
    switch (event.kind) {
      case "create": {
        onCreate?.(event.paths[0]);
        break;
      }
      case "modify": {
        onModify?.(event.paths[0]);
        break;
      }
      case "remove": {
        onRemove?.(event.paths[0]);
        break;
      }
    }
  }
}
