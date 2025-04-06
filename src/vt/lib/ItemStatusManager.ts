import { levenshteinDistance } from "@std/text";
import { asProjectItemType, type ProjectItemType } from "~/types.ts";
import { RENAME_DETECTION_THRESHOLD } from "~/consts.ts";

export interface ItemInfo {
  type: ProjectItemType;
  path: string;
  mtime: number;
  content?: string; // directories don't have content
}

export type ItemStatusState =
  | "deleted"
  | "created"
  | "modified"
  | "not_modified"
  | "renamed";

export interface BaseItemStatus extends ItemInfo {
  status: ItemStatusState;
}

export type ModifiedItemStatus = BaseItemStatus & {
  status: "modified";
};

export type NotModifiedItemStatus = BaseItemStatus & {
  status: "not_modified";
};

export type DeletedItemStatus = BaseItemStatus & {
  status: "deleted";
};

export type CreatedItemStatus = BaseItemStatus & {
  status: "created";
};

export type RenamedItemStatus = BaseItemStatus & {
  status: "renamed";
  oldPath: string;
  similarity: number;
};

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
    return this.#modified.size +
      this.#not_modified.size +
      this.#deleted.size +
      this.#created.size +
      this.#renamed.size;
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
   * Returns the file state as an array of key-value pairs.
   * @returns An array of entries from the JSON representation
   */
  public entries(): [string, ItemStatus[]][] {
    return Object.entries(this.toJSON());
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
   *
   * @param item - The file status to insert
   */
  public insert(item: ItemStatus): this {
    if (item.path.length === 0) throw new Error("File path cannot be empty");

    switch (item.status) {
      case "created":
        // Check if there's a deleted file with the same path
        if (this.#deleted.has(item.path)) {
          this.#deleted.delete(item.path);
          item = { ...item, status: "modified" };
          this.#modified.set(item.path, item as ModifiedItemStatus);
        } else {
          this.#created.set(item.path, item as CreatedItemStatus);
        }
        break;
      case "deleted":
        // Check if there's a created file with the same path
        if (this.#created.has(item.path)) {
          this.#created.delete(item.path);
          item = { ...item, status: "modified" };
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
   * Check to see if any item in the ItemStateManager is a renamed version of
   * any other item, for every item. Consolidates the items into a single item
   * of renamed state if a rename is detected.
   */
  public consolidateRenames(): this {
    const processed = new Set<string>();

    for (const oldItem of [...this.deleted]) {
      // Find the most similar other entry
      let maxSimilarItem: RenamedItemStatus | null = null;
      for (const newItem of [...this.created]) {
        // deno-fmt-ignore
        if (oldItem.type === "directory" || newItem.type === "directory") continue;
        if (oldItem.path === newItem.path) continue;

        // If the file was deleted BEFORE the new one was created it couldn't have been renamed
        if (!(newItem.mtime > oldItem.mtime)) continue;

        // Content is empty if either is a directory, so we can use ! here
        // since we already checked that
        // The creation should always be local (since we are detecting a local rename)
        const newItemContent = newItem.content!;
        const oldItemContent = oldItem.content!;

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
            type: asProjectItemType(newItem.type),
            mtime: newItem.mtime,
            content: newItem.content,
          };
        }

        // If we detected a similar item, then add it to the state
        if (maxSimilarItem && !processed.has(maxSimilarItem.path)) {
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
