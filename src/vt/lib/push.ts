import * as path from "@std/path";
import sdk, { getLatestVersion } from "~/sdk.ts";
import ValTown from "@valtown/sdk";
import type { ProjectItemType } from "~/consts.ts";
import { status } from "~/vt/lib/status.ts";
import type { FileStateChanges } from "~/vt/lib/pending.ts";

/**
 * Pushes latest changes from a vt folder into a Val Town project. Note that
 * this is NOT atomic and you could end up with partial updates.
 *
 * @param args Options for pull operation.
 * @param {string} args.targetDir The vt project root directory.
 * @param {string} args.projectId The id of the project to upload to.
 * @param {string} args.branchId The branch ID to upload file content to.
 * @param {string} args.branchId The version to compute the file state changes against. Defaults to latest version.
 * @param {string[]} args.gitignoreRules A list of gitignore rules.
 * @param {FileStateChanges} args.fileStateChanges The current file state changes. If not provided, it will be computed.
 *
 * @returns Promise that resolves when the push operation is complete.
 */
export async function push({
  targetDir,
  projectId,
  branchId,
  version,
  fileStateChanges,
  gitignoreRules,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  version?: number;
  fileStateChanges?: FileStateChanges;
  gitignoreRules: string[];
}): Promise<FileStateChanges> {
  version = version || await getLatestVersion(projectId, branchId);

  // Use provided status, or retreive the status
  fileStateChanges = fileStateChanges || await status({
    targetDir,
    projectId,
    branchId,
    version,
    gitignoreRules,
  });

  // Upload files that were modified locally
  const modifiedPromises = fileStateChanges.modified
    .filter((file) => file.type !== "directory")
    .map(async (file) => {
      await sdk.projects.files.update(
        projectId,
        {
          path: file.path,
          branch_id: branchId,
          content: await Deno.readTextFile(path.join(targetDir, file.path)),
          name: path.basename(file.path),
          type: file.type as Exclude<ProjectItemType, "directory">,
        },
      );
    });

  // Delete files that exist on the server but not locally
  const deletedPromises = fileStateChanges.deleted.map(async (file) => {
    await sdk.projects.files.delete(projectId, {
      path: file.path,
      branch_id: branchId,
    });
  });

  // First ensure all directories exist
  for (const file of fileStateChanges.created) {
    if (file.path.includes("/")) {
      await ensureValtownDir(projectId, branchId, file.path);
    }
  }

  // Upload all files that exist locally but not on the server
  for (const file of fileStateChanges.created) {
    try {
      if (file.type === "directory") {
        // We want to make sure we get all the empty directories
        await ensureValtownDir(projectId, branchId, file.path, true);
      } else {
        // Upload the file
        await sdk.projects.files.create(
          projectId,
          {
            path: file.path,
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

  // Wait for all operations to complete
  await Promise.all([
    ...modifiedPromises,
    ...deletedPromises,
  ]);

  return fileStateChanges;
}

async function ensureValtownDir(
  projectId: string,
  branchId: string,
  filePath: string,
  isDirectory = false,
): Promise<void> {
  // Note that we cannot use path logic here because it must specific to val town
  const dirPath = isDirectory ? filePath : path.dirname(filePath);

  // If path is "." (current directory) or empty, no directories need to be created
  if (dirPath === "." || dirPath === "") return;

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
        { path: currentPath, type: "directory", branch_id: branchId },
      );
    } catch (error) {
      assertAllowedUploadError(error);
    }
  }
}

function assertAllowedUploadError(error: unknown) {
  if (error instanceof ValTown.APIError) {
    if (error.status != 409) throw error;
  } else throw error;
}
