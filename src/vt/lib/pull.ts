import { join, relative } from "@std/path";
import { copy, exists, walk } from "@std/fs";
import { getProjectItemType, shouldIgnore } from "~/vt/lib/paths.ts";
import { listProjectItems } from "~/sdk.ts";
import { clone } from "~/vt/lib/clone.ts";
import { doAtomically } from "~/vt/lib/utils/misc.ts";
import {
  type ItemStatus,
  ItemStatusManager,
} from "~/vt/lib/utils/ItemStatusManager.ts";

/**
 * Parameters for pulling latest changes from a Val Town project into a vt folder.
 */
export interface PullParams {
  /** The vt project root directory. */
  targetDir: string;
  /** The id of the project to download from. */
  projectId: string;
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
 * Pulls latest changes from a Val Town project into a vt folder.
 *
 * @param {PullParams} params Options for pull operation.
 *
 * @description
 * After a pull:
 * - All files from the remote project exist at the remote's version's location locally
 * - Local files that match gitignore rules are preserved at their current path
 * - Untracked local files that were never pushed are preserved
 *
 * Files that are removed:
 * - Files that previously existed in the remote project but were deleted
 *
 * @returns Promise that resolves with changes that were applied or would be applied (if dryRun=true)
 */
export function pull(params: PullParams): Promise<ItemStatusManager> {
  const {
    targetDir,
    projectId,
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
      await copy(targetDir, tmpDir, {
        preserveTimestamps: true,
        overwrite: true,
      });

      // Clone all the files from the project into the temp dir. This
      // implicitly will overwrite files with the current version on the
      // server.
      const { itemStateChanges: cloneChanges } = await clone({
        targetDir: tmpDir,
        projectId,
        branchId,
        version,
        gitignoreRules,
        dryRun,
      });

      // Merge the clone changes into our changes object
      changes.merge(cloneChanges);

      // Get list of files from the server
      const projectItems = await listProjectItems(
        projectId,
        branchId,
        version,
      );
      const projectItemsSet = new Set(projectItems.map((file) => file.path));

      // Scan the temp directory to identify files that should be deleted
      const pathsToDelete: string[] = [];
      for await (const entry of walk(tmpDir)) {
        const relativePath = relative(tmpDir, entry.path);
        const targetDirPath = join(targetDir, relativePath);
        const tmpDirPath = entry.path;

        if (shouldIgnore(relativePath, gitignoreRules)) continue;
        if (relativePath === "" || entry.path === tmpDir) continue;
        if (projectItemsSet.has(relativePath)) continue;

        const stat = await Deno.stat(entry.path);
        const fileStatus: ItemStatus = {
          path: relativePath,
          status: "deleted",
          type: stat.isDirectory ? "directory" : await getProjectItemType(
            projectId,
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
        if (await exists(path)) {
          await Deno.remove(path, { recursive: true });
        }
      }));
      return [changes, !dryRun];
    },
    { targetDir, prefix: "vt_pull_" },
  );
}
