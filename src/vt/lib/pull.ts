import { join, relative } from "@std/path";
import { getValItemType, shouldIgnore } from "~/vt/lib/paths.ts";
import { listValItems } from "~/sdk.ts";
import {
  type ItemStatus,
  ItemStatusManager,
} from "~/vt/lib/utils/ItemStatusManager.ts";
import { walk } from "@std/fs";
import { clone } from "~/vt/lib/clone.ts";
import { doAtomically, gracefulRecursiveCopy } from "~/vt/lib/utils/misc.ts";

/** Result of pull operation  */
export interface PushResult {
  itemStateChanges: ItemStatusManager;
}

/**
 * Parameters for pulling latest changes from a Val Town Val into a vt folder.
 */
export interface PullParams {
  /** The vt Val root directory. */
  targetDir: string;
  /** The id of the Val to download from. */
  valId: string;
  /** The branch ID to download file content from. */
  branchId: string;
  /** The version to pull. Defaults to latest version. */
  version: number;
  /** A list of gitignore rules. */
  gitignoreRules?: string[];
  /** If true, don't actually modify files, just report what would change. */
  dryRun?: boolean;
}

/**
 * Pulls latest changes from a Val Town Val into a vt folder.
 *
 * After a pull:
 * - All files from the remote Val exist at the remote's version's location locally
 * - Local files that match gitignore rules are preserved at their current path
 * - Untracked local files that were never pushed are preserved
 *
 * Files that are removed:
 * - Files that previously existed in the remote Val but were deleted
 *
 * @param params Options for pull operation.
 * @returns Promise that resolves with changes that were applied or would be applied (if dryRun=true)
 */
export function pull(params: PullParams): Promise<PushResult> {
  const {
    targetDir,
    valId,
    branchId,
    version,
    gitignoreRules = [],
    dryRun = false,
  } = params;
  return doAtomically(
    async (tmpDir) => {
      const changes = new ItemStatusManager();

      // Copy over all the files in the original dir into the temp dir During a
      // dry run the purpose here is to ensure that clone reports back the
      // proper status for modified files (e.g. if they existed and would be
      // changed then they're modified)
      await gracefulRecursiveCopy(targetDir, tmpDir, {
        preserveTimestamps: true,
        overwrite: true,
      });

      // Clone all the files from the Val into the temp dir. This
      // implicitly will overwrite files with the current version on the
      // server.
      const { itemStateChanges: cloneChanges } = await clone({
        targetDir: tmpDir,
        valId,
        branchId,
        version,
        gitignoreRules,
        dryRun,
      });

      // Merge the clone changes into our changes object
      changes.merge(cloneChanges);

      // Get list of files from the server
      const valItems = await listValItems(
        valId,
        branchId,
        version,
      );
      const valItemsSet = new Set(valItems.map((file) => file.path));

      // Scan the temp directory to identify files that should be deleted
      const pathsToDelete: string[] = [];
      for await (const entry of walk(tmpDir)) {
        const relativePath = relative(tmpDir, entry.path);
        const targetDirPath = join(targetDir, relativePath);
        const tmpDirPath = entry.path;

        if (shouldIgnore(relativePath, gitignoreRules)) continue;
        if (relativePath === "." || entry.path === tmpDir) continue;
        if (valItemsSet.has(relativePath)) continue;

        const stat = await Deno.stat(entry.path);
        const fileStatus: ItemStatus = {
          path: relativePath,
          status: "deleted",
          type: stat.isDirectory ? "directory" : await getValItemType(
            valId,
            branchId,
            version,
            relativePath,
          ),
          mtime: stat.mtime?.getTime()!,
        };
        changes.insert(fileStatus);

        // Delete the file from both directories if not in dry run mode
        if (!dryRun) {
          pathsToDelete.push(targetDirPath);
          pathsToDelete.push(tmpDirPath);
        }
      }

      // Perform the deletions
      await Promise.all(pathsToDelete.map(async (path) => {
        try {
          await Deno.remove(path, { recursive: true });
        } catch (e) {
          if (!(e instanceof Deno.errors.NotFound)) throw e;
        }
      }));

      return [{ itemStateChanges: changes }, !dryRun];
    },
    { targetDir, prefix: "vt_pull_" },
  );
}
