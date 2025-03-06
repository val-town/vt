import { status } from "~/vt/git/status.ts";
import * as path from "@std/path";
import sdk from "~/sdk.ts";
import { getValType, withoutValExtension } from "~/vt/git/paths.ts";

/**
 * Pushes latest changes from a vt folder into a Val Town project.
 *
 * @param args Options for pull operation.
 * @param {string} args.targetDir The vt project root directory.
 * @param {string} args.projectId The id of the project to upload to.
 * @param {string} args.branchId The branch ID to upload file content to.
 * @param {string[]} args.ignoreGlobs A list of glob patterns for files to exclude.
 *
 * @returns Promise that resolves when the push operation is complete.
 */
export async function push({
  targetDir,
  projectId,
  branchId,
  ignoreGlobs,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  version: number;
  ignoreGlobs: string[];
}): Promise<void> {
  const statusResult = await status({
    targetDir,
    projectId,
    branchId,
    ignoreGlobs,
  });

  // Upload everything that was modified
  for (const file of statusResult.modified) {
    //TODO: Delete, then create file (waiting on val town api support)
  }

  // Delete everything that was deleted
  for (const file of statusResult.deleted) {
    // TODO: Delete file  (waiting on val town api support)
  }

  // Create all new files
  for (const file of statusResult.created) {
    await sdk.projects.files.create(projectId, withoutValExtension(file.path), {
      content: await Deno.readTextFile(path.join(targetDir, file.path)),
      branch_id: branchId,
      type: getValType(file.path),
    });
  }
}
