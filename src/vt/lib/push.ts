import * as path from "@std/path";
import sdk, { getLatestVersion } from "~/sdk.ts";
import ValTown from "@valtown/sdk";
import { status } from "~/vt/lib/status.ts";
import type { FilesStatusManager } from "~/vt/lib/FilesStatusManager.ts";
import { asProjectFileType, asProjectItemType } from "~/types.ts";

/**
 * Parameters for pushing latest changes from a vt folder into a Val Town project.
 */
export interface PushParams {
  /** The vt project root directory. */
  targetDir: string;
  /** The id of the project to upload to. */
  projectId: string;
  /** The branch ID to upload to. */
  branchId: string;
  /** The version to compute the file state changes against. Defaults to latest version. */
  version?: number;
  /** The current file state. If not provided, it will be computed. */
  fileState?: FilesStatusManager;
  /** A list of gitignore rules. */
  gitignoreRules?: string[];
  /** If true, don't actually modify files on server, just report what would change. */
  dryRun?: boolean;
}

/**
 * Pushes latest changes from a vt folder into a Val Town project. Note that
 * this is NOT atomic and you could end up with partial updates.
 *
 * @param {PushParams} params Options for push operation.
 * @returns Promise that resolves with changes that were applied or would be applied (if dryRun=true)
 */
export async function push(params: PushParams): Promise<FilesStatusManager> {
  let {
    targetDir,
    projectId,
    branchId,
    version,
    fileState,
    gitignoreRules,
    dryRun = false,
  } = params;
  version = version || await getLatestVersion(projectId, branchId);

  // Use provided status, or retrieve the status
  if (!fileState || fileState.isEmpty()) {
    fileState = await status({
      targetDir,
      projectId,
      branchId,
      version,
      gitignoreRules,
    });
  }

  if (dryRun) return fileState; // Exit early if dry run

  // Upload files that were modified locally
  const modifiedPromises = fileState.modified
    .filter((file) => file.type !== "directory")
    .map(async (file) => {
      await sdk.projects.files.update(
        projectId,
        {
          path: file.path,
          branch_id: branchId,
          content: await Deno.readTextFile(path.join(targetDir, file.path)),
          name: path.basename(file.path),
          type: asProjectFileType(file.type),
        },
      );
    });

  // Delete files that exist on the server but not locally
  const deletedPromises = fileState.deleted.map(async (file) => {
    await sdk.projects.files.delete(projectId, {
      path: file.path,
      branch_id: branchId,
      recursive: true,
    });
  });

  // First ensure all directories exist
  for (const file of fileState.created) {
    if (file.path.includes("/")) {
      await ensureValtownDir(projectId, branchId, file.path, false);
    }
  }

  // Upload all files that exist locally but not on the server
  for (const file of fileState.created) {
    try {
      if (file.type === "directory") {
        // We want to make sure we get all the empty directories
        await ensureValtownDir(projectId, branchId, file.path, true);
      } else {
        // The file type is already a ProjectItemType since it comes from fileState
        // but we'll use asProjectItemType for extra safety
        const fileType = asProjectItemType(file.type);

        // Upload the file
        await sdk.projects.files.create(
          projectId,
          {
            path: file.path,
            content: (await Deno.readTextFile(path.join(targetDir, file.path))),
            branch_id: branchId,
            type: asProjectFileType(fileType),
          },
        );
      }
    } catch (e) {
      assertAllowedUploadError(e);
    }
  }

  // Wait for all operations to complete
  await Promise.all([
    ...modifiedPromises,
    ...deletedPromises,
  ]);

  return fileState;
}

async function ensureValtownDir(
  projectId: string,
  branchId: string,
  filePath: string,
  isDirectory = false,
): Promise<void> {
  // Note that we cannot use path logic here because it must specific to val town
  const dirPath = isDirectory ? filePath : path.dirname(filePath);

  // If path is "" (root) no directories need to be created
  if (dirPath === "") return;

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
    } catch (e) {
      assertAllowedUploadError(e);
    }
  }
}

function assertAllowedUploadError(error: unknown) {
  if (error instanceof ValTown.APIError) {
    if (error.status != 409) throw error;
  } else throw error;
}
