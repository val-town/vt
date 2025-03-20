import { join, relative } from "@std/path";
import { copy, walk } from "@std/fs";
import { shouldIgnore } from "~/vt/git/paths.ts";
import sdk from "~/sdk.ts";
import { doAtomically } from "~/vt/git/utils.ts";
import { clone } from "~/vt/git/clone.ts";

/**
 * Pulls latest changes from a Val Town project into a vt folder.
 *
 * @param args Options for pull operation.
 * @param {string} args.targetDir The vt project root directory.
 * @param {string} args.projectId The id of the project to download from.
 * @param {string} args.branchId The branch ID to download file content from.
 * @param {number} args.version The version to pull. Defaults to latest version.
 * @param {string[]} args.gitignoreRules A list of gitignore rules.
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
 * @returns Promise that resolves when the pull operation is complete.
 */
export function pull({
  targetDir,
  projectId,
  branchId,
  version,
  gitignoreRules,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  version: number;
  gitignoreRules: string[];
}): Promise<void> {
  return doAtomically(
    async (tempDir) => {
      // Copy over all the files in the original dir into the temp dir
      await copy(targetDir, tempDir, {
        preserveTimestamps: true,
        overwrite: true,
      });

      // Clone all the files from the project into the temp dir. This
      // implicitly will overwrite files with the current version on the
      // server.
      await clone({
        targetDir: tempDir,
        projectId,
        branchId,
        version,
        gitignoreRules,
      });

      // Collect files to delete
      const filesToDelete: string[] = [];

      // Get list of files from the server
      const files = new Set<string>();
      for await (
        const file of sdk.projects.files.list(projectId, {
          branch_id: branchId,
          version,
          recursive: true,
        })
      ) {
        files.add(file.path);
      }

      // Identify files that should be deleted
      for await (const entry of walk(tempDir)) {
        const relativePath = relative(tempDir, entry.path);
        if (shouldIgnore(relativePath, gitignoreRules)) continue;
        if (entry.path === "" || entry.path === tempDir) continue;
        if (!files.has(relativePath)) filesToDelete.push(entry.path);
      }

      // Perform all the deletions operations
      await Promise.all(filesToDelete.map(async (filePath) => {
        const relativePath = relative(tempDir, filePath);
        const deletionPath = join(targetDir, relativePath);
        console.log(deletionPath);
        await Deno.remove(deletionPath, { recursive: true });
      }));
    },
    targetDir,
    "vt_pull_",
  );
}
