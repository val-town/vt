import type { ValFileType, ValItemType } from "~/types.ts";
import {
  createValItem,
  deleteValFile,
  getLatestVersion,
  listValItems,
  updateValFile,
} from "~/sdk.ts";
import { status } from "~/vt/lib/status.ts";
import { basename, DELIMITER, dirname, join } from "@std/path";
import { assert } from "@std/assert";
import { exists } from "@std/fs/exists";
import ValTown from "@valtown/sdk";
import { pooledMap } from "@std/async";
import {
  getItemWarnings,
  ItemStatusManager,
} from "~/vt/lib/utils/ItemStatusManager.ts";
import slash from "slash";

/** Result of push operation  */
export interface PushResult {
  /** Changes made to Val items during the push process */
  itemStateChanges: ItemStatusManager;
}

/**
 * Parameters for pushing latest changes from a vt folder into a Val Town val.
 */
export interface PushParams {
  /** The vt Val root directory. */
  targetDir: string;
  /** The id of the Val to upload to. */
  valId: string;
  /** The branch ID to upload to. */
  branchId: string;
  /** A list of gitignore rules. */
  gitignoreRules?: string[];
  /** If true, don't actually modify files on server, just report what would change. */
  dryRun?: boolean;
  /** Maximum number of concurrent operations. Defaults to 10. */
  concurrencyPoolSize?: number;
}

/**
 * Pushes latest changes from a vt folder into a Val Town val. Note that
 * this is NOT atomic and you could end up with partial updates.
 *
 * @param params Options for push operation.
 * @returns Promise that resolves with changes that were applied or would be applied (if dryRun=true)
 */
export async function push(params: PushParams): Promise<PushResult> {
  const {
    targetDir,
    valId,
    branchId,
    gitignoreRules,
    dryRun = false,
    concurrencyPoolSize = 5,
  } = params;
  const initialVersion = await getLatestVersion(valId, branchId);

  assert(await exists(targetDir), "target directory doesn't exist");

  // Retrieve the status
  const { itemStateChanges } = await status({
    targetDir,
    valId,
    branchId,
    version: initialVersion,
    gitignoreRules,
  });

  if (dryRun) return { itemStateChanges }; // Exit early if dry run

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

  // Get existing Val items to check which directories already exist
  const existingItems = await listValItems(
    valId,
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
    valId,
    branchId,
    safeItemStateChanges,
    existingDirs,
    itemStateChanges,
  );

  // Define all file operations that will occur
  const fileOperations: (() => Promise<unknown>)[] = [];

  // Renamed files
  safeItemStateChanges.renamed
    .filter((f) => f.type !== "directory")
    .forEach((f) =>
      fileOperations.push(() => {
        return doReqMaybeApplyWarning(
          async () =>
            await updateValFile(valId, {
              path: f.oldPath!,
              branchId,
              name: basename(f.path),
              parentPath: dirname(f.path) === "." ? null : dirname(f.path),
              content: f.content,
            }),
          f.path,
          itemStateChanges,
        );
      })
    );

  // Created files
  safeItemStateChanges.created
    .filter((f) => f.type !== "directory")
    .forEach((f) =>
      fileOperations.push(async () => {
        return await doReqMaybeApplyWarning(
          async () =>
            await createValItem(valId, {
              path: f.path,
              content: f.content!,
              branchId,
              type: f.type as Exclude<ValItemType, "directory">,
            }),
          f.path,
          itemStateChanges,
        );
      })
    );

  // Modified files
  safeItemStateChanges.modified
    .filter((f) => f.type !== "directory")
    .forEach((f) =>
      fileOperations.push(async () => {
        return await doReqMaybeApplyWarning(
          async () =>
            await updateValFile(valId, {
              path: slash(f.path),
              branchId,
              content: f.content,
              name: basename(f.path),
              type: f.type as ValFileType,
            }),
          f.path,
          itemStateChanges,
        );
      })
    );

  // Deleted files
  itemStateChanges.deleted
    .forEach((f) =>
      fileOperations.push(async () => {
        return await doReqMaybeApplyWarning(
          async () =>
            await deleteValFile(valId, {
              path: f.path,
              branchId,
              recursive: true,
            }),
          f.path,
          itemStateChanges,
        );
      })
    );

  // Execute all operations with limited concurrency
  await Array.fromAsync(pooledMap(
    concurrencyPoolSize,
    fileOperations,
    async (op) => await op(),
  ));

  return { itemStateChanges };
}

async function createRequiredDirectories(
  valId: string,
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
      const segmentsA = a.split(DELIMITER).filter(Boolean).length;
      const segmentsB = b.split(DELIMITER).filter(Boolean).length;
      return segmentsA - segmentsB; // Sort by segment count (fewest first)
    });

  // Create all necessary directories
  for (const path of sortedDirsToCreate) {
    await doReqMaybeApplyWarning(
      () =>
        createValItem(valId, {
          path,
          type: "directory",
          branchId,
        }),
      path,
      itemStateChanges,
    );
    // Add to existing dirs set after creation
    existingDirs.add(path);
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
