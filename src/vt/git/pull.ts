import { ensureDir, walk } from "@std/fs";
import { dirname, join, relative } from "@std/path";
import { clone } from "~/vt/git/clone.ts";
import { doAtomically } from "~/vt/git/utils.ts";
import { shouldIgnore } from "~/vt/git/paths.ts";
/**
 * Pulls latest changes from a val town project into a vt folder.
 *
 * @param args Options for pull operation.
 * @param {string} args.targetDir - The vt project root directory.
 * @param {string} args.projectId - The id of the project to be pulled.
 * @param {string} args.branchId - The branch ID from which to pull the latest changes.
 * @param {string[]} args.gitignoreRules - A list of gitignore rules.
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
      // Save ignored files
      const ignoredFiles = new Map<string, Uint8Array>();

      try {
        // Walk through all files in the target directory
        for await (const entry of walk(targetDir, { includeDirs: false })) {
          const relativePath = relative(targetDir, entry.path);

          // Check if this file should be ignored
          if (shouldIgnore(entry.path)) {
            // Read file content
            const content = await Deno.readFile(entry.path);
            ignoredFiles.set(relativePath, content);
          }
        }
      } catch (error) {
        // Handle case where targetDir doesn't exist yet
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      }

      // Clone fresh files from the project
      await clone({
        targetDir: tempDir,
        projectId,
        branchId,
        version,
        gitignoreRules,
      });

      // Restore ignored files
      for (const [path, content] of ignoredFiles.entries()) {
        const filePath = join(tempDir, path);
        await ensureDir(dirname(filePath));
        await Deno.writeFile(filePath, content);
      }
    },
    targetDir,
    "vt_pull_",
  );
}
