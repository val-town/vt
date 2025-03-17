import { clone } from "~/vt/git/clone.ts";
import { status, StatusResult } from "~/vt/git/status.ts";
import * as path from "@std/path";
import { doAtomically } from "~/vt/git/utils.ts";

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
  statusResult,
  gitignoreRules,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  version: number;
  statusResult?: StatusResult;
  gitignoreRules: string[];
}): Promise<StatusResult> {
  return doAtomically(
    async (tmpDir) => {
      // Use provided status, or retreive the status
      statusResult = statusResult || await status({
        targetDir: tmpDir,
        projectId,
        branchId,
        gitignoreRules,
        version,
      });

      // Remove all existing tracked files
      const removalPromises = statusResult.not_modified
        .map((file) => path.join(tmpDir, file.path))
        .map(async (filePath) => {
          try {
            await Deno.remove(filePath);
          } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) throw error;
          }
        });
      await Promise.all(removalPromises);

      // Clone fresh files from the project
      await clone({
        targetDir,
        projectId,
        branchId,
        version,
        gitignoreRules,
      });

      return statusResult;
    },
    targetDir,
    "vt_pull_",
  );
}
