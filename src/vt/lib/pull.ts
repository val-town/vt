import { join, relative } from "@std/path";
import { copy, walk } from "@std/fs";
import { shouldIgnore } from "~/vt/lib/paths.ts";
import { listProjectItems } from "~/sdk.ts";
import { doAtomically } from "~/vt/lib/utils.ts";
import { clone } from "~/vt/lib/clone.ts";
import {
  emptyFileStateChanges,
  type FileStateChanges,
} from "~/vt/lib/pending.ts";

/**
 * Pulls latest changes from a Val Town project into a vt folder.
 *
 * @param args Options for pull operation.
 * @param {string} args.targetDir The vt project root directory.
 * @param {string} args.projectId The id of the project to download from.
 * @param {string} args.branchId The branch ID to download file content from.
 * @param {number} args.version The version to pull. Defaults to latest version.
 * @param {string[]} args.gitignoreRules A list of gitignore rules.
 * @param {boolean} [args.dryRun] If true, don't actually modify files, just report what would change.
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
export function pull({
  targetDir,
  projectId,
  branchId,
  version,
  gitignoreRules,
  dryRun = false,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  version: number;
  gitignoreRules: string[];
  dryRun?: boolean;
}): Promise<FileStateChanges> {
  return doAtomically(
    async (tempDir) => {
      const changes: FileStateChanges = emptyFileStateChanges();

      // Copy over all the files in the original dir into the temp dir During a
      // dry run the purpose here is to ensure that clone reports back the
      // proper status for modified files (e.g. if they existed and would be
      // changed then they're modified)
      await copy(targetDir, tempDir, {
        preserveTimestamps: true,
        overwrite: true,
      });

      // Clone all the files from the project into the temp dir. This
      // implicitly will overwrite files with the current version on the
      // server.
      const cloneChanges = await clone({
        targetDir: tempDir,
        projectId,
        branchId,
        version,
        gitignoreRules,
        dryRun,
      });

      // Merge the clone changes into our changes object
      changes.modified.push(...cloneChanges.modified);
      changes.not_modified.push(...cloneChanges.not_modified);
      changes.created.push(...cloneChanges.created);

      // Get list of files from the server
      const files = new Set(
        await listProjectItems(projectId, {
          path: "",
          branch_id: branchId,
          version,
        }).then((resp) => resp.map((file) => file.path)),
      );

      // Identify files that should be deleted
      if (dryRun) {
        // In dry run mode, we need to scan the target directory directly
        for await (const entry of walk(targetDir)) {
          const relativePath = relative(targetDir, entry.path);
          if (shouldIgnore(relativePath, gitignoreRules)) continue;
          if (relativePath === "" || entry.path === targetDir) continue;
          if (!files.has(relativePath)) {
            const stat = await Deno.stat(entry.path);
            changes.deleted.push({
              path: relativePath,
              status: "deleted",
              type: stat.isDirectory ? "directory" : "file",
              mtime: stat.mtime?.getTime()!,
            });
          }
        }
      } else {
        // In actual run mode, we scan the temp directory
        for await (const entry of walk(tempDir)) {
          const relativePath = relative(tempDir, entry.path);
          if (shouldIgnore(relativePath, gitignoreRules)) continue;
          if (relativePath === "" || entry.path === tempDir) continue;
          if (!files.has(relativePath)) {
            const stat = await Deno.stat(entry.path);
            changes.deleted.push({
              path: relativePath,
              status: "deleted",
              type: stat.isDirectory ? "directory" : "file",
              mtime: stat.mtime?.getTime()!,
            });

            await Deno.remove(join(targetDir, relativePath), {
              recursive: true,
            });
            await Deno.remove(join(tempDir, relativePath), { recursive: true });
          }
        }
      }

      return changes;
    },
    targetDir,
    "vt_pull_",
  );
}
