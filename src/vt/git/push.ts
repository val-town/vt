import { status } from "~/vt/git/status.ts";
import * as path from "@std/path";
import sdk from "~/sdk.ts";
import { getValType, withoutValExtension } from "~/vt/git/paths.ts";
import ValTown from "@valtown/sdk";

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
    await sdk.projects.files.update(projectId, withoutValExtension(file.path), {
      branch_id: branchId,
      content: await Deno.readTextFile(path.join(targetDir, file.path)),
      type: getValType(file.path),
      name: path.basename(withoutValExtension(file.path)),
    });
  }

  // Delete everything that was deleted
  for (const file of statusResult.deleted) {
    // TODO: Delete file  (waiting on val town api support)
  }

  // Create all new files
  for (const file of statusResult.created) {
    // Ensure parent directories exist before creating the file
    await ensureValtownDir(
      projectId,
      branchId,
      withoutValExtension(file.path),
    );

    try {
      await sdk.projects.files.create(
        projectId,
        encodeURIComponent(withoutValExtension(file.path)),
        {
          content: await Deno.readTextFile(path.join(targetDir, file.path)),
          branch_id: branchId,
          type: getValType(file.path),
        },
      );
    } catch (error) {
      assertAllowedUploadError(error);
    }
  }
}

async function ensureValtownDir(
  projectId: string,
  branchId: string,
  filePath: string,
): Promise<void> {
  const dirPath = path.dirname(filePath);

  // If path is "." (current directory) or empty, no directories need to be created
  if (dirPath === "." || dirPath === "") {
    return;
  }

  // Split the path into segments
  const segments = dirPath.split("/");
  let currentPath = "";

  // Create each directory in the path if it doesn't exist
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === "") continue;

    currentPath += (currentPath ? "/" : "") + segments[i];

    // Create directory - content can be null, empty string, or omitted for directories
    try {
      await sdk.projects.files.create(
        projectId,
        encodeURIComponent(currentPath),
        {
          type: "directory",
          branch_id: branchId,
          content: null,
        },
      );
    } catch (error) {
      assertAllowedUploadError(error);
    }
  }
}

function assertAllowedUploadError(error: any) {
  if (error instanceof ValTown.APIError) {
    if (error.status != 409) {
      throw error;
    }
  } else {
    throw error;
  }
}
