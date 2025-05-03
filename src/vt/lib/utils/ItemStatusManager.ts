import { levenshteinDistance } from "@std/text";
import type { ProjectItemType } from "~/types.ts";
import {
  MAX_FILE_CHARS,
  MAX_FILENAME_LENGTH,
  PROJECT_ITEM_NAME_REGEX,
  RENAME_DETECTION_THRESHOLD,
  TYPE_PRIORITY,
} from "~/consts.ts";
import { basename } from "@std/path";
import { hasNullBytes } from "../../../../utils/misc.ts";

/**
 * Possible warning states for a project item.
 *
 * @property bad_name - The item has an invalid name format
 * @property binary - The item contains binary content
 * @property empty - The item is empty (0 bytes)
 * @property too_large - The item exceeds maximum allowed size
 * @property unknown - An unspecified warning with additional information (e.g. API errors)
 */
export type ItemWarning =
  | "bad_name"
  | "binary"
  | "empty"
  | "too_large"
  | `unknown: ${string}`;

/**
 * Base information about a project item.
 */
export interface ItemInfo {
  /** The type of the project item (e.g., "file", "directory") */
  type: ProjectItemType;
  /** The file path of the item */
  path: string;
  /** The modification timestamp of the item */
  mtime: number;
  /** The content of the item (not applicable for directories) */
  content?: string; // directories don't have content
  /** List of warnings associated with this item, if any */
  warnings?: ItemWarning[];
}

/**
 * The possible status states of a project item.
 *
 * @property deleted - The item has been removed
 * @property created - The item is newly created
 * @property modified - The item's content has been changed
 * @property not_modified - The item exists but has not been changed
 * @property renamed - The item has been moved/renamed (also implies modification)
 */
export type ItemStatusState =
  | "deleted"
  | "created"
  | "modified"
  | "not_modified"
  | "renamed";

/**
 * Base interface for all item status types, combining item information with status.
 */
export interface BaseItemStatus extends ItemInfo {
  /** The current status state of the item */
  status: ItemStatusState;
}

/**
 * An item that has been modified either locally or remotely.
 */
export type ModifiedItemStatus = BaseItemStatus & {
  /** Indicates this item has been modified */
  status: "modified";
  /** Specifies whether the modification happened locally or remotely */
  where: "local" | "remote";
};

/**
 * An item that exists but has not been modified.
 */
export type NotModifiedItemStatus = BaseItemStatus & {
  /** Indicates this item exists but has not been modified */
  status: "not_modified";
};

/**
 * An item that has been deleted.
 */
export type DeletedItemStatus = BaseItemStatus & {
  /** Indicates this item has been deleted */
  status: "deleted";
};

/**
 * An item that has been newly created.
 */
export type CreatedItemStatus = BaseItemStatus & {
  /** Indicates this item has been newly created */
  status: "created";
};

/**
 * An item that has been renamed or moved from a different path.  Note that
 * renamed items should also be assumed to be modified (different file content).
 */
export type RenamedItemStatus = BaseItemStatus & {
  /** Indicates this item has been renamed/moved */
  status: "renamed";
  /** The original path of the item before it was renamed */
  oldPath: string;
  /** A value between 0-1 indicating how similar the content is to the original */
  similarity: number;
};

/**
 * Union type of all possible item status types.
 */
export type ItemStatus =
  | ModifiedItemStatus
  | NotModifiedItemStatus
  | DeletedItemStatus
  | CreatedItemStatus
  | RenamedItemStatus;

/**
 * Class for managing file state changes with operations for creating,
 * merging, and processing file states.
 */
export class ItemStatusManager {
  #modified: Map<string, ModifiedItemStatus>;
  #not_modified: Map<string, NotModifiedItemStatus>;
  #deleted: Map<string, DeletedItemStatus>;
  #created: Map<string, CreatedItemStatus>;
  #renamed: Map<string, RenamedItemStatus>;

  /**
   * Create a new ItemStatusManager.
   *
   * @param {Partial<ItemStatus>} initialState The initial state of the file status manager. This is a partial object that can contain any of the file states.
   */
  public constructor(
    initialState?: Partial<{
      modified?: ModifiedItemStatus[];
      not_modified?: NotModifiedItemStatus[];
      deleted?: DeletedItemStatus[];
      created?: CreatedItemStatus[];
      renamed?: RenamedItemStatus[];
    }>,
  ) {
    this.#modified = new Map(
      (initialState?.modified || []).map((file) => [file.path, file]),
    );
    this.#not_modified = new Map(
      (initialState?.not_modified || []).map((file) => [file.path, file]),
    );
    this.#deleted = new Map(
      (initialState?.deleted || []).map((file) => [file.path, file]),
    );
    this.#created = new Map(
      (initialState?.created || []).map((file) => [file.path, file]),
    );
    this.#renamed = new Map(
      (initialState?.renamed || []).map((file) => [file.path, file]),
    );
  }

  get modified(): ModifiedItemStatus[] {
    return Array.from(this.#modified.values());
  }

  get not_modified(): NotModifiedItemStatus[] {
    return Array.from(this.#not_modified.values());
  }

  get deleted(): DeletedItemStatus[] {
    return Array.from(this.#deleted.values());
  }

  get created(): CreatedItemStatus[] {
    return Array.from(this.#created.values());
  }

  get renamed(): RenamedItemStatus[] {
    return Array.from(this.#renamed.values());
  }

  /**
   * Returns the total number of files across all status categories.
   *
   * @returns The total number of files in this FileState
   */
  public size(): number {
    return this.all().length;
  }

  /**
   * Returns all items in this ItemStatusManager as a single array.
   *
   * @returns Array containing all items from all categories
   */
  public all(): ItemStatus[] {
    return [
      ...this.created,
      ...this.deleted,
      ...this.modified,
      ...this.not_modified,
      ...this.renamed,
    ];
  }

  /**
   * Returns the total number of changes. This is the total number of files
   * minus the files that were not modified.
   *
   * @returns The total number of files in this FileState
   */
  public changes(): number {
    return this.size() - this.#not_modified.size;
  }

  /**
   * Checks if any item in the ItemStatusManager has warnings.
   *
   * @returns True if at least one item has warnings, false otherwise
   */
  public hasWarnings(): boolean {
    return this.all().some((item) => item.warnings?.length);
  }

  /**
   * Returns the file state as an array of key-value pairs.
   * When sorted=true, entries are sorted by:
   * 1. Path segment count (longest paths first)
   * 2. Type (created, deleted, modified, etc.)
   * 3. Basename length
   * 4. Alphabetical order of the type if all else is equal
   *
   * @param options - Optional configuration {sorted: boolean}
   * @returns An array of entries from the JSON representation
   */
  public entries(options?: { sorted?: boolean }): [string, ItemStatus[]][] {
    const entries = Object.entries(this.toJSON());

    if (!options?.sorted) {
      return entries;
    }

    // Flatten all files with their categories (a category being, created,
    // deleted, etc)
    const allFiles = entries
      .flatMap(
        // Transform each category to be more "verbose", like [created, FileStatus]
        ([category, files]) =>
          files.map((file) => [category, file] as [string, ItemStatus]),
      );

    // Sort all files by our criteria
    allFiles.sort((a, b) => {
      const [aCategory, aFile] = a;
      const [bCategory, bFile] = b;

      // 1. Path segment count (longest paths first)
      const aSegments = aFile.path.split("/").length;
      const bSegments = bFile.path.split("/").length;
      if (aSegments !== bSegments) {
        return bSegments - aSegments; // Longest paths first
      }

      // 2. Sort by file type
      if (aFile.type !== bFile.type) {
        return (
          (TYPE_PRIORITY[aFile.type] || Number.MAX_SAFE_INTEGER) -
          (TYPE_PRIORITY[bFile.type] || Number.MAX_SAFE_INTEGER)
        );
      }

      // 3. Status type priority
      const statusPriority: Record<string, number> = {
        "created": 0,
        "deleted": 1,
        "modified": 2,
        "not_modified": 3,
      };
      const aPriority = statusPriority[aCategory];
      const bPriority = statusPriority[bCategory];
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // 4. Basename length
      const aBasename = basename(aFile.path);
      const bBasename = basename(bFile.path);
      if (aBasename.length !== bBasename.length) {
        return aBasename.length - bBasename.length;
      }

      // 5. Alphabetical order of path
      return aFile.path.localeCompare(bFile.path);
    });

    // Regroup files into categories
    const result = new Map<string, ItemStatus[]>();
    for (const [category, file] of allFiles) {
      if (!result.has(category)) {
        result.set(category, []);
      }
      result.get(category)!.push(file);
    }

    // Convert to array entries
    return Array.from(result.entries());
  }

  /**
   * Removes an item with the specified path from any status category.
   *
   * @param path - The path of the item to remove
   * @returns true if the item was found and removed, false otherwise
   */
  public remove(path: string): boolean {
    if (this.#modified.has(path)) {
      this.#modified.delete(path);
      return true;
    }

    if (this.#not_modified.has(path)) {
      this.#not_modified.delete(path);
      return true;
    }

    if (this.#deleted.has(path)) {
      this.#deleted.delete(path);
      return true;
    }

    if (this.#created.has(path)) {
      this.#created.delete(path);
      return true;
    }

    if (this.#renamed.has(path)) {
      this.#renamed.delete(path);
      return true;
    }

    return false;
  }

  /**
   * Inserts a file with the specified status, automatically handling transitions
   * between states based on existing entries.
   */
  public insert(item: ItemStatus): this {
    if (item.path.length === 0) throw new Error("File path cannot be empty");

    switch (item.status) {
      case "created":
        // Check if there's a deleted file with the same path
        if (this.#deleted.has(item.path)) {
          this.#deleted.delete(item.path);
          // If it was deleted and created relative to the remote it was a local modification
          item = { ...item, status: "modified", where: "local" };
          this.#modified.set(item.path, item as ModifiedItemStatus);
        } else {
          this.#created.set(item.path, item as CreatedItemStatus);
        }
        break;
      case "deleted":
        // Check if there's a created file with the same path
        if (this.#created.has(item.path)) {
          this.#created.delete(item.path);
          // If it was deleted and created relative to the remote it was a local modification
          item = { ...item, status: "modified", where: "local" };
          this.#modified.set(item.path, item as ModifiedItemStatus);
        } else {
          this.#deleted.set(item.path, item as DeletedItemStatus);
        }
        break;
      case "renamed":
        // Remove created and deleted files with the same name
        this.#created.delete(item.path);
        this.#created.delete(item.oldPath);
        this.#deleted.delete(item.path);
        this.#deleted.delete(item.oldPath);
        this.#renamed.set(item.path, item as RenamedItemStatus);
        break;
      case "modified":
        this.#modified.set(item.path, item as ModifiedItemStatus);
        break;
      case "not_modified":
        this.#not_modified.set(item.path, item as NotModifiedItemStatus);
        break;
    }

    return this;
  }

  /**
   * Gets the item with the specified path from any status category.
   *
   * @param path - The path of the item to get
   * @returns The item with the specified path, or undefined if not found
   * @throws Error if item with the specified path doesn't exist
   */
  public get(path: string): ItemStatus {
    if (this.#modified.has(path)) return this.#modified.get(path)!;
    if (this.#not_modified.has(path)) return this.#not_modified.get(path)!;
    if (this.#deleted.has(path)) return this.#deleted.get(path)!;
    if (this.#created.has(path)) return this.#created.get(path)!;
    if (this.#renamed.has(path)) return this.#renamed.get(path)!;

    throw new Error(`Item with path "${path}" not found`);
  }

  /**
   * Updates an existing item with the specified path by applying a partial update.
   * Preserves existing properties not included in the update.
   *
   * @param path - The path of the item to update
   * @param update - Partial object with properties to update
   * @returns this - The current ItemStatusManager instance for chaining
   * @throws Error if item with the specified path doesn't exist
   */
  public update(path: string, update: Partial<ItemStatus>): this {
    // Find the item in any status category
    let existingItem: ItemStatus | undefined;

    if (this.#modified.has(path)) {
      existingItem = this.#modified.get(path);
    } else if (this.#not_modified.has(path)) {
      existingItem = this.#not_modified.get(path);
    } else if (this.#deleted.has(path)) {
      existingItem = this.#deleted.get(path);
    } else if (this.#created.has(path)) {
      existingItem = this.#created.get(path);
    } else if (this.#renamed.has(path)) {
      existingItem = this.#renamed.get(path);
    }

    if (!existingItem) {
      throw new Error(`Item with path "${path}" not found`);
    }

    // Create a new item by merging existing with update
    const updatedItem = { ...existingItem, ...update };

    // Remove the old item and insert the updated one
    this.remove(path);
    this.insert(updatedItem as ItemStatus);

    return this;
  }

  /**
   * Check to see if any item in the ItemStateManager is a renamed version of
   * any other item, for every item. Consolidates the items into a single item
   * of renamed state if a rename is detected.
   */
  public consolidateRenames(): this {
    const processed = new Set<string>();

    const deletedItems = Array.from(this.deleted)
      .sort((a, b) => b.mtime - a.mtime);
    const createdItems = Array.from(this.created)
      .sort((a, b) => b.mtime - a.mtime);

    for (const oldItem of deletedItems) {
      // Find the most similar other entry
      let maxSimilarItem: RenamedItemStatus | null = null;
      for (const newItem of createdItems) {
        // deno-fmt-ignore
        if (oldItem.type === "directory" || newItem.type === "directory") continue;
        if (oldItem.path === newItem.path) continue;

        // Content is empty if either is a directory, so we can use ! here
        // since we already checked that
        // The creation should always be local (since we are detecting a local rename)
        const newItemContent = newItem.content || "";
        const oldItemContent = oldItem.content || "";

        // If newItemContent differs in length by more than
        // RENAME_DETECTION_THRESHOLD% of oldItemContent, skip it since it
        // cannot possibly be a candidate
        if (
          (Math.abs(newItemContent.length - oldItemContent.length) /
            Math.max(newItemContent.length, oldItemContent.length)) >
            RENAME_DETECTION_THRESHOLD
        ) continue;

        // If contents are identical, we've found our match - early break
        if (newItemContent === oldItemContent) {
          maxSimilarItem = {
            path: newItem.path,
            status: "renamed",
            similarity: 1, // Perfect similarity
            oldPath: oldItem.path,
            type: oldItem.type, // Preserve the type
            mtime: newItem.mtime,
            content: newItem.content,
          };
          break; // Early break as we've found a perfect match
        }

        // Calculate similarity for non-identical content
        const distance = levenshteinDistance(newItemContent, oldItemContent);

        // deno-fmt-ignore
        const similarity = 1 - (distance / Math.max(newItemContent.length, oldItemContent.length));
        if (
          (similarity > RENAME_DETECTION_THRESHOLD) && (
            (maxSimilarItem && similarity > maxSimilarItem.similarity) ||
            !maxSimilarItem
          )
        ) {
          maxSimilarItem = {
            path: newItem.path,
            status: "renamed",
            similarity,
            oldPath: oldItem.path,
            type: oldItem.type, // Preserve the type
            mtime: newItem.mtime,
            content: newItem.content,
          };
        }
      }

      // If we detected a similar item, then add it to the state
      if (maxSimilarItem && !processed.has(maxSimilarItem.path)) {
        // If there are any other files that were created or deleted that have
        // the same contents then we ignore the rename, unless the duplicate's
        // mtime is older
        const contentToCheck = maxSimilarItem.content;

        const hasDuplicateContent = contentToCheck && (
          this.deleted.some((item) =>
            item.path !== oldItem.path &&
            item.content === contentToCheck &&
            item.mtime >= oldItem.mtime
          ) ||
          this.created.some((item) =>
            item.path !== maxSimilarItem!.path &&
            item.content === contentToCheck &&
            item.mtime >= oldItem.mtime
          )
        );

        if (!hasDuplicateContent) {
          this.insert(maxSimilarItem);
          processed.add(maxSimilarItem.path);
          processed.add(maxSimilarItem.oldPath);
        }
      }
    }

    return this;
  }

  /**
   * Merges a source FileState object into the current instance.
   * Files in the source take precedence over existing files with the same path.
   * This acts like a right intersection where source values override existing ones.
   *
   * @param source - The FileState object to merge from
   * @returns this - The current FileState instance for chaining
   */
  public merge(source: ItemStatusManager): this {
    // Collect all paths from the source
    const sourcePaths = new Set<string>();

    for (const file of source.modified) sourcePaths.add(file.path);
    for (const file of source.not_modified) sourcePaths.add(file.path);
    for (const file of source.deleted) sourcePaths.add(file.path);
    for (const file of source.created) sourcePaths.add(file.path);

    // Remove any existing files with paths in the source
    for (const path of sourcePaths) {
      this.#modified.delete(path);
      this.#not_modified.delete(path);
      this.#deleted.delete(path);
      this.#created.delete(path);
    }

    // Now insert all files from the source
    for (const file of source.modified) this.insert(file);
    for (const file of source.not_modified) this.insert(file);
    for (const file of source.deleted) this.insert(file);
    for (const file of source.created) this.insert(file);
    for (const file of source.renamed) this.insert(file);

    return this;
  }

  /**
   * Creates a new FileState with only the entries that pass the given predicate function.
   *
   * @param predicate - Function that tests each entry. Takes a FileStateEntry and returns a boolean.
   * @returns A new FileState containing only entries that pass the predicate test
   */
  public filter(
    predicate: (entry: ItemStatus) => boolean,
  ): ItemStatusManager {
    const result = new ItemStatusManager();

    for (const file of this.created) {
      if (predicate(file)) result.insert(file);
    }

    for (const file of this.deleted) {
      if (predicate(file)) result.insert(file);
    }

    for (const file of this.modified) {
      if (predicate(file)) result.insert(file);
    }

    for (const file of this.not_modified) {
      if (predicate(file)) result.insert(file);
    }

    for (const file of this.renamed) {
      if (predicate(file)) result.insert(file);
    }

    return result;
  }

  /**
   * Creates a new ItemStatusManager with the results of calling a provided function
   * on every item in this ItemStatusManager.
   *
   * @param mapper - Function that produces a new item from an existing item
   * @returns A new ItemStatusManager with the mapped items
   */
  public map(
    mapper: (entry: ItemStatus) => ItemStatus,
  ): ItemStatusManager {
    const result = new ItemStatusManager();

    for (const file of this.created) {
      result.insert(mapper(file));
    }

    for (const file of this.deleted) {
      result.insert(mapper(file));
    }

    for (const file of this.modified) {
      result.insert(mapper(file));
    }

    for (const file of this.not_modified) {
      result.insert(mapper(file));
    }

    for (const file of this.renamed) {
      result.insert(mapper(file));
    }

    return result;
  }

  /**
   * Checks if a file with the specified path exists in any status category.
   *
   * @param path - The file path to check
   * @returns True if the path exists in any status, false otherwise
   */
  public has(path: string): boolean {
    return (
      this.#not_modified.has(path) ||
      this.#modified.has(path) ||
      this.#deleted.has(path) ||
      this.#created.has(path) ||
      this.#renamed.has(path)
    );
  }

  /**
   * Determines if this FileState has any files in any state.
   * Returns true if there are files, false if all maps are empty.
   */
  public isEmpty(): boolean {
    return this.#modified.size === 0 &&
      this.#not_modified.size === 0 &&
      this.#deleted.size === 0 &&
      this.#created.size === 0 &&
      this.#renamed.size === 0;
  }

  /**
   * JSON object representation of the file state.
   */
  public toJSON() {
    return {
      modified: this.modified,
      not_modified: this.not_modified,
      deleted: this.deleted,
      created: this.created,
      renamed: this.renamed,
    };
  }

  [Symbol.for("Deno.customInspect")](): string {
    return JSON.stringify(this.toJSON(), null, 2);
  }
}

/**
 * Get a list of warnings for a given item at a specific path.
 */
/**
 * Analyzes a file or directory and returns an array of warnings based on file characteristics.
 *
 * This function checks for several potential issues:
 * - Binary content (contains null bytes)
 * - Invalid filename or length
 * - Empty files
 * - Files exceeding maximum allowed size
 *
 * @param path - The filesystem path to check
 * @returns A Promise that resolves to an array of ItemWarning strings
 * @throws May throw errors during file system operations
 */
export async function getItemWarnings(path: string): Promise<ItemWarning[]> {
  const warnings: ItemWarning[] = [];

  const fileInfo = await Deno.stat(path);
  const fileContent = fileInfo.isDirectory ? "" : await Deno.readTextFile(path)
    .catch(() => "");

  // Weird deno issue where sometimes a directory isn't counted as one
  const isDirectory = fileInfo.isDirectory ||
    (!fileInfo.isDirectory && fileContent === undefined);

  if (!fileInfo.isDirectory && hasNullBytes(await Deno.readTextFile(path))) {
    warnings.push("binary");
  }
  if (
    basename(path).length > MAX_FILENAME_LENGTH ||
    !PROJECT_ITEM_NAME_REGEX.test(basename(path))
  ) {
    warnings.push("bad_name");
  }

  if (!isDirectory) {
    if (fileInfo.size === 0) {
      warnings.push("empty");
    }
    if (fileContent.length > MAX_FILE_CHARS) {
      warnings.push("too_large");
    }
  }

  return warnings;
}
