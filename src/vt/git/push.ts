import { status, type StatusResult } from "~/vt/git/status.ts";
import * as path from "@std/path";
import sdk, { getLatestVersion } from "~/sdk.ts";
import ValTown from "@valtown/sdk";

/**
 * Pushes latest changes from a vt folder into a Val Town project.
 *
 * @param args Options for pull operation.
 * @param {string} args.targetDir The vt project root directory.
 * @param {string} args.projectId The id of the project to upload to.
 * @param {string} args.branchId The branch ID to upload file content to.
 * @param {string} args.branchId The version to compute the status against. Defaults to latest version.
 * @param {string[]} args.ignoreGlobs A list of glob patterns for files to exclude.
 * @param {StatusResult} args.status The current status. If not provided, it will be computed.
 *
 * @returns Promise that resolves when the push operation is complete.
 */
export async function push({
  targetDir,
  projectId,
  branchId,
  version,
  statusResult,
  ignoreGlobs,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  version?: number;
  statusResult?: StatusResult;
  ignoreGlobs: string[];
}): Promise<StatusResult> {
  version = version || await getLatestVersion(projectId, branchId);

  // Use provided status, or retreive the status
  statusResult = statusResult || await status({
    targetDir,
    projectId,
    branchId,
    version,
    ignoreGlobs,
  });

  // Upload everything that was modified
  for (const file of statusResult.modified) {
    if (file.type === "directory") continue;

    await sdk.projects.files.update(
      projectId,
      encodeURIComponent(file.path),
      {
        branch_id: branchId,
        content: await Deno.readTextFile(path.join(targetDir, file.path)),
        name: path.basename(file.path),
        type: file.type,
      },
    );
  }

  // Delete everything that was deleted
  for (const file of statusResult.deleted) {
    await sdk.projects.files.delete(projectId, file.path, {
      branch_id: branchId,
      version,
    });
  }

  // Create all new files
  for (const file of statusResult.created) {
    // Ensure parent directories exist before creating the file
    await ensureValtownDir(
      projectId,
      branchId,
      file.path,
    );

    try {
      if (file.type === "directory") {
        // We already ensured the directory path exists
      } else {
        await sdk.projects.files.create(
          projectId,
          encodeURIComponent(file.path),
          {
            content: (await Deno.readTextFile(path.join(targetDir, file.path))),
            branch_id: branchId,
            type: file.type,
          },
        );
      }
    } catch (error) {
      assertAllowedUploadError(error);
    }
  }

  return statusResult;
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

function assertAllowedUploadError(error: unknown) {
  if (error instanceof ValTown.APIError) {
    if (error.status != 409) {
      throw error;
    }
  } else {
    throw error;
  }
}
