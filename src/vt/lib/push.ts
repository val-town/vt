import {
  getItemWarnings,
  ItemStatusManager,
} from "~/vt/lib/ItemStatusManager.ts";
import type { ProjectFileType, ProjectItemType } from "~/types.ts";
import sdk, {
  getLatestVersion,
  getProjectItem,
  listProjectItems,
} from "~/sdk.ts";
import { status } from "~/vt/lib/status.ts";
import { basename, dirname, join } from "@std/path";
import { assert } from "@std/assert";
import { exists } from "@std/fs/exists";
import ValTown from "@valtown/sdk";

export interface PushResult {
  /** Changes made to project items during the push process */
  itemStateChanges: ItemStatusManager;
}

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
export async function push(params: PushParams): Promise<PushResult> {
  const {
    targetDir,
    projectId,
    branchId,
    gitignoreRules,
    dryRun = false,
  } = params;
  const initialVersion = await getLatestVersion(projectId, branchId);

  assert(await exists(targetDir), "target directory doesn't exist");

  // Retrieve the status
  const itemStateChanges = await status({
    targetDir,
    projectId,
    branchId,
    version: initialVersion,
    gitignoreRules,
  });

  if (dryRun) return { itemStateChanges: itemStateChanges }; // Exit early if dry run

  // Create a filtered down status with everything that is safe to upload
  const safeItemStateChanges = new ItemStatusManager();
  (await Promise.all(
    itemStateChanges
      .all()
      .filter((f) =>
        f.status === "modified" ||
        f.status === "created" ||
        f.status === "renamed"
      )
      .map(async (item) => ({
        ...item,
        warnings: await getItemWarnings(join(targetDir, item.path)),
      })),
  ))
    .filter((item) => item.warnings?.length === 0) // no warnings
    .forEach((item) => safeItemStateChanges.insert(item));

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
  await createRequiredDirectories(
    projectId,
    branchId,
    safeItemStateChanges,
    existingDirs,
    itemStateChanges,
  );
  const versionAfterDirectories = await getLatestVersion(projectId, branchId);

  // Rename files that were renamed locally
  const renamePromises = safeItemStateChanges.renamed
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

      const isAtRoot = basename(file.path) == file.path;

      if (isAtRoot) {
        await doReqMaybeApplyWarning(
          async () =>
            await sdk.projects.files.update(projectId, {
              branch_id: branchId,
              name: undefined,
              parent_id: null,
              path: file.oldPath,
            }),
          file.path,
          itemStateChanges,
        );
      }

      // To move the file to the root dir parent_id must be null and the name
      // must be undefined (the api is very picky about this!)
      return await doReqMaybeApplyWarning(
        async () =>
          await sdk.projects.files.update(projectId, {
            branch_id: branchId,
            name: isAtRoot ? undefined : basename(file.path),
            // type: file.type as ProjectFileType,
            // content: file.content,
            parent_id: parent?.id || null,
            path: file.oldPath,
            content: file.content,
          }),
        file.path,
        itemStateChanges,
      );
    });

  // Create all new files that were created (we already handled directories)
  const createdPromises = safeItemStateChanges.created
    .filter((f) => f.type !== "directory") // Already created directories
    .map(async (file) => {
      // Upload the file
      return await doReqMaybeApplyWarning(
        async () =>
          await sdk.projects.files.create(
            projectId,
            {
              path: file.path,
              content: file.content!, // It's a file not a dir so this should be defined
              branch_id: branchId,
              type: file.type as Exclude<ProjectItemType, "directory">,
            },
          ),
        file.path,
        itemStateChanges,
      );
    });

  // Upload files that were modified locally
  const modifiedPromises = safeItemStateChanges.modified
    .filter((file) => file.type !== "directory")
    .map(async (file) => {
      return await doReqMaybeApplyWarning(
        async () =>
          await sdk.projects.files.update(
            projectId,
            {
              path: file.path,
              branch_id: branchId,
              content: file.content,
              name: basename(file.path),
              type: file.type as ProjectFileType,
            },
          ),
        file.path,
        itemStateChanges,
      );
    });

  // Delete files that exist on the server but not locally
  const deletedPromises = itemStateChanges.deleted.map(async (file) => {
    return await doReqMaybeApplyWarning(
      async () =>
        await sdk.projects.files.delete(projectId, {
          path: file.path,
          branch_id: branchId,
          recursive: true,
        }),
      file.path,
      itemStateChanges,
    );
  });

  // Wait for all modifications and deletions to complete
  await Promise.all([
    ...modifiedPromises,
    ...deletedPromises,
    ...renamePromises,
    ...createdPromises,
  ]);

  return { itemStateChanges };
}

async function createRequiredDirectories(
  projectId: string,
  branchId: string,
  fileState: ItemStatusManager,
  existingDirs: Set<string>,
  itemStateChanges: ItemStatusManager,
): Promise<void> {
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
    await doReqMaybeApplyWarning(
      () =>
        sdk.projects.files.create(
          projectId,
          { path, type: "directory", branch_id: branchId },
        ),
      path,
      itemStateChanges,
    );
    // Add to existing dirs set after creation
    existingDirs.add(path);
    createdCount++;
  }
}

// Executes a request and applies a warning to the item if the request fails.
async function doReqMaybeApplyWarning<T>(
  requestFn: () => Promise<T>,
  itemPath: string,
  itemStateChanges: ItemStatusManager,
): Promise<T | undefined> {
  try {
    return await requestFn();
  } catch (e) {
    if (e instanceof ValTown.APIError) {
      itemStateChanges.update(itemPath, {
        warnings: [
          ...(itemStateChanges.get(itemPath)?.warnings || []),
          `unknown: ${e.message}`,
        ],
      });
    } else {
      throw e;
    }
    return undefined;
  }
}
