import type { ItemStatusManager } from "~/vt/lib/ItemStatusManager.ts";
import type { ProjectFileType, ProjectItemType } from "~/types.ts";
import sdk, {
  getLatestVersion,
  getProjectItem,
  listProjectItems,
} from "~/sdk.ts";
import { status } from "~/vt/lib/status.ts";
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
    fileState,
    gitignoreRules,
    dryRun = false,
  } = params;
  const initialVersion = await getLatestVersion(projectId, branchId);

  // Use provided status, or retrieve the status
  if (!fileState || fileState.isEmpty()) {
    fileState = await status({
      targetDir,
      projectId,
      branchId,
      version: initialVersion,
      gitignoreRules,
    });
  }

  if (dryRun) return fileState; // Exit early if dry run

  // Get existing project items to check which directories already exist
  const existingItems = await listProjectItems(
    projectId,
    branchId,
    initialVersion,
  );

  // Create a set of existing paths that already exist
  const existingDirs = new Set([ // no duplicates
    ...existingItems
      .filter((item) => item.type === "directory")
      .map((item) => item.path),
    ...existingItems.map((item) => dirname(item.path)),
  ]);

  // Create all necessary directories first
  const versionAfterDirectories = await createRequiredDirectories(
    projectId,
    branchId,
    fileState,
    existingDirs,
  ) + initialVersion;

  // Rename files that were renamed locally
  const renamePromises = fileState.renamed
    .filter((file) => file.type !== "directory")
    .map(async (file) => {
      // We created the parent directory already, but not the file, so we must
      // query the ID of the parent directory to set it as the new parent of the
      // item
      const parent = await getProjectItem(
        projectId,
        branchId,
        versionAfterDirectories,
        dirname(file.path),
      );

      await sdk.projects.files.update(projectId, {
        branch_id: branchId,
        name: basename(file.path),
        type: file.type as ProjectFileType,
        content: file.content,
        parent_id: parent?.id,
        path: file.oldPath,
      });
    });

  // Create all new files that were created (we already handled directories)
  const createdPromises = fileState.created
    .filter((f) => f.type !== "directory") // Already created directories
    .map(async (file) => {
      // Upload the file
      await sdk.projects.files.create(
        projectId,
        {
          path: file.path,
          content: await Deno.readTextFile(join(targetDir, file.path)),
          branch_id: branchId,
          type: file.type as Exclude<ProjectItemType, "directory">,
        },
      );
    });

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

  // Delete files that exist on the server but not locally
  const deletedPromises = fileState.deleted.map(async (file) => {
    await sdk.projects.files.delete(projectId, {
      path: file.path,
      branch_id: branchId,
      recursive: true,
    });
  });

  // Wait for all modifications and deletions to complete
  await Promise.all([
    ...modifiedPromises,
    ...deletedPromises,
    ...renamePromises,
    ...createdPromises,
  ]);

  return fileState;
}

async function createRequiredDirectories(
  projectId: string,
  branchId: string,
  fileState: ItemStatusManager,
  existingDirs: Set<string>,
): Promise<number> {
  // Get directories that need to be created
  const dirsToCreate = fileState.created
    .filter((f) => f.type === "directory")
    .map((f) => f.path)
    .filter((path) => !existingDirs.has(path));

  // Add parent directories of created files if they don't exist
  fileState.created
    .filter((f) => f.type !== "directory")
    .forEach((file) => {
      let dir = dirname(file.path);
      while (
        dir &&
        dir !== "." &&
        !existingDirs.has(dir) &&
        !dirsToCreate.includes(dir)
      ) {
        dirsToCreate.push(dir);
        dir = dirname(dir); // eventually becomes "."
      }
    });

  // Sort directories by depth to ensure parent directories are created first
  const sortedDirsToCreate = [...new Set(dirsToCreate)]
    .sort((a, b) => {
      const segmentsA = a.split("/").filter(Boolean).length;
      const segmentsB = b.split("/").filter(Boolean).length;
      return segmentsA - segmentsB; // Sort by segment count (fewest first)
    });

  // Create all necessary directories
  let createdCount = 0;
  for (const path of sortedDirsToCreate) {
    await sdk.projects.files.create(
      projectId,
      { path, type: "directory", branch_id: branchId },
    );
    // Add to existing dirs set after creation
    existingDirs.add(path);
    createdCount++;
  }

  return createdCount;
}
