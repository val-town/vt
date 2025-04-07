import sdk, { getLatestVersion, getProjectItem } from "~/sdk.ts";
import ValTown from "@valtown/sdk";
import { status } from "~/vt/lib/status.ts";
import type { ItemStatusManager } from "~/vt/lib/ItemStatusManager.ts";
import type { ProjectFileType } from "~/types.ts";
import { basename, dirname, join } from "@std/path";

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
  fileState?: ItemStatusManager;
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
export async function push(params: PushParams): Promise<ItemStatusManager> {
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
          content: file.content,
          name: basename(file.path),
          type: file.type as ProjectFileType,
        },
      );
    });

  // Rename files that were renamed locally
  const renamePromises = fileState.renamed
    .filter((file) => file.type !== "directory")
    .map(async (file) => {
      await sdk.projects.files.update(projectId, {
        branch_id: branchId,
        name: basename(file.path),
        type: file.type as ProjectFileType,
        content: file.content,
        parent_id: (await getProjectItem(projectId, {
          filePath: dirname(file.path),
          branchId,
          version,
        }))?.id,
        path: file.oldPath,
      });
    });

  // Delete files that exist on the server but not locally
  const deletedPromises = fileState.deleted.map(async (file) => {
    await sdk.projects.files.delete(projectId, {
      path: file.path,
      branch_id: branchId,
      recursive: true,
    });
  });

  await assertAllDirs(
    projectId,
    branchId,
    fileState.created
      .filter((f) => f.type === "directory")
      .map((f) => f.path),
  );

  // Upload all files that exist locally but not on the server
  const createdPromises = fileState.created
    .filter((file) => file.type !== "directory") // Filter out directories since we already handled them
    .map(async (file) => {
      try {
        const fileType = file.type;

        // Upload the file
        return await sdk.projects.files.create(
          projectId,
          {
            path: file.path,
            content: (await Deno.readTextFile(join(targetDir, file.path))),
            branch_id: branchId,
            type: fileType as ProjectFileType,
          },
        );
      } catch (e) {
        assertAllowedUploadError(e);
        return null;
      }
    });

  // Wait for all operations to complete
  await Promise.all([
    ...modifiedPromises,
    ...deletedPromises,
    ...createdPromises,
    ...renamePromises,
  ]);

  return fileState.consolidateRenames();
}

async function assertAllDirs(
  projectId: string,
  branchId: string,
  paths: string[],
) {
  const allDirs = paths
    .map((p) => p.split("/"))
    .sort((a, b) => a.length - b.length); // Sort by path depth

  const allCreatedDirs = new Set<string>();

  // Process directories from shallowest to deepest without using shift
  for (const dir of allDirs) {
    const path = dir.join("/");
    if (path === "") continue; // Skip empty path

    if (!allCreatedDirs.has(path)) {
      // Only create if not already created
      await sdk.projects.files.create(
        projectId,
        { path, type: "directory", branch_id: branchId },
      );
      allCreatedDirs.add(path);
    }
  }
}

function assertAllowedUploadError(error: unknown) {
  if (error instanceof ValTown.APIError) {
    if (error.status != 409) throw error;
  } else throw error;
}
