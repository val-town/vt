import { join, relative } from "@std/path";
import { copy, walk } from "@std/fs";
import { shouldIgnore } from "~/vt/lib/paths.ts";
import { listProjectItems } from "~/sdk.ts";
import { doAtomically } from "~/vt/lib/utils.ts";
import { clone } from "~/vt/lib/clone.ts";
import { FileState, type FileStatus } from "~/vt/lib/FileState.ts";

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
  version?: number;
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
export function pull(params: PullParams): Promise<FileState> {
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
      const changes = FileState.empty();

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
      const cloneChanges = await clone({
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
      const files = new Set(
        await listProjectItems(projectId, {
          path: "",
          branch_id: branchId,
          version,
          recursive: true,
        }).then((resp) => resp.map((file) => file.path)),
      );

      // Identify files that should be deleted
      if (dryRun) {
        // In dry run mode, we need to scan the target directory directly
        for await (const entry of walk(targetDir)) {
          const relativePath = relative(targetDir, entry.path);
          if (shouldIgnore(relativePath, gitignoreRules)) continue;
          if (relativePath === "" || entry.path === targetDir) continue;
          if (files.has(relativePath)) continue;

          await Deno.stat(entry.path)
            .then((stat) =>
              changes.insert({
                path: relativePath,
                status: "deleted",
                type: stat.isDirectory ? "directory" : "file",
                mtime: stat.mtime?.getTime()!,
                where: "local",
              })
            );
        }
      } else {
        // In actual run mode, we scan the temp directory
        for await (const entry of walk(tmpDir)) {
          const relativePath = relative(tmpDir, entry.path);
          if (shouldIgnore(relativePath, gitignoreRules)) continue;
          if (relativePath === "" || entry.path === tmpDir) continue;
          if (files.has(relativePath)) continue;

          const stat = await Deno.stat(entry.path);
          const fileStatus: FileStatus = {
            path: relativePath,
            status: "deleted",
            type: stat.isDirectory ? "directory" : "file",
            mtime: stat.mtime?.getTime()!,
            where: "local",
          };
          changes.insert(fileStatus);

          await Deno.remove(join(targetDir, relativePath), {
            recursive: true,
          });
          await Deno.remove(join(tmpDir, relativePath), { recursive: true });
        }
      }

      return [changes, !dryRun];
    },
    targetDir,
    "vt_pull_",
  );
}
