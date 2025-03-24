import type { ProjectItemType } from "~/consts.ts";

export interface FileInfo {
  mtime: number;
  type: ProjectItemType;
}

export interface FileStatus extends FileInfo {
  status: "modified" | "not_modified" | "deleted" | "created";
  path: string;
}

export interface FileStateChanges {
  modified: FileStatus[];
  not_modified: FileStatus[];
  deleted: FileStatus[];
  created: FileStatus[];
}

/**
 * Creates an empty FileStateChanges object with initialized empty arrays
 * for all status categories (modified, not_modified, deleted, created).
 *
 * @returns A new FileStateChanges object with empty arrays
 */
export function emptyFileStateChanges(): FileStateChanges {
  return {
    modified: [],
    not_modified: [],
    deleted: [],
    created: [],
  } as FileStateChanges;
}

/**
 * Merges a source FileStateChanges object into a target FileStateChanges object,
 * modifying the target in place. Uses Sets to prevent duplicate entries based on file paths.
 *
 * @param target - The FileStateChanges object to be modified
 * @param source - The FileStateChanges object to merge from
 * @returns The modified target FileStateChanges object
 */
export function mergeFileStateChanges(
  target: FileStateChanges,
  source: FileStateChanges,
): FileStateChanges {
  // Process each status category
  const categories: (keyof FileStateChanges)[] = [
    "modified",
    "not_modified",
    "deleted",
    "created",
  ];

  for (const category of categories) {
    // Create a Set using paths as keys to identify duplicates
    const existingPaths = new Set(target[category].map((item) => item.path));

    // Add items from source that aren't already in target
    for (const item of source[category]) {
      if (!existingPaths.has(item.path)) {
        target[category].push(item);
        existingPaths.add(item.path);
      }
    }
  }

  return target;
}

/**
 * Processes a FileStateChanges object to move items that appear in both
 * "created" and "deleted" arrays to the "modified" array.
 *
 * @param state - The FileStateChanges object to be mutated
 * @returns The modified FileStateChanges object
 */
export function processCreatedAndDeleted(
  state: FileStateChanges,
): FileStateChanges {
  // Create a map of paths from deleted items
  const deletedPaths = new Map<string, FileStatus>();
  state.deleted.forEach((item) => {
    deletedPaths.set(item.path, item);
  });

  // Find items that exist in both created and deleted arrays
  const itemsToMove: FileStatus[] = [];
  const createdToKeep: FileStatus[] = [];

  for (const createdItem of state.created) {
    if (deletedPaths.has(createdItem.path)) {
      // Create a new item with "modified" status
      const modifiedItem: FileStatus = {
        ...createdItem,
        status: "modified",
        // We can take the mtime from the created item
        // or from the deleted item if needed
      };

      itemsToMove.push(modifiedItem);
    } else {
      createdToKeep.push(createdItem);
    }
  }

  // Update the state by adding to modified and filtering created and deleted
  state.modified = [...state.modified, ...itemsToMove];
  state.created = createdToKeep;
  state.deleted = state.deleted.filter((item) =>
    !itemsToMove.some((moved) => moved.path === item.path)
  );

  return state;
}
