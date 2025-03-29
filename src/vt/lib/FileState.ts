import type { ProjectItemType } from "~/consts.ts";

export interface FileInfo {
  mtime: number;
  type: ProjectItemType;
  where: "local" | "remote";
}

export type FileStatusType =
  | "modified"
  | "not_modified"
  | "deleted"
  | "created";

export interface FileStatus extends FileInfo {
  status: FileStatusType;
  path: string;
}

/**
 * Class for managing file state changes with operations for creating,
 * merging, and processing file states.
 */
export class FileState {
  #modified: Map<string, FileStatus>;
  #not_modified: Map<string, FileStatus>;
  #deleted: Map<string, FileStatus>;
  #created: Map<string, FileStatus>;

  public constructor(
    initialState?: Partial<{
      modified?: FileStatus[];
      not_modified?: FileStatus[];
      deleted?: FileStatus[];
      created?: FileStatus[];
    }>,
  ) {
    this.#modified = new Map<string, FileStatus>(
      (initialState?.modified || []).map((file) => [file.path, file]),
    );
    this.#not_modified = new Map<string, FileStatus>(
      (initialState?.not_modified || []).map((file) => [file.path, file]),
    );
    this.#deleted = new Map<string, FileStatus>(
      (initialState?.deleted || []).map((file) => [file.path, file]),
    );
    this.#created = new Map<string, FileStatus>(
      (initialState?.created || []).map((file) => [file.path, file]),
    );
  }

  /**
   * Creates an empty FileState object with initialized empty maps for all
   * status categories.
   */
  static empty(): FileState {
    return new FileState();
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
      this.#created.size;
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
  public entries(): [string, FileStatus[]][] {
    return Object.entries(this.toJSON());
  }

  /**
   * Inserts a file with the specified status, automatically handling transitions
   * between states based on existing entries.
   *
   * @param file - The file status to insert
   */
  public insert(file: FileStatus): this {
    if (file.path.length === 0) throw new Error("File path cannot be empty");

    // Handle the special case for created/deleted files
    if (file.status === "created") {
      // Check if there's a deleted file with the same path
      if (this.#deleted.has(file.path)) {
        this.#deleted.delete(file.path);
        file = { ...file, status: "modified" };
      }
    } else if (file.status === "deleted") {
      // Check if there's a created file with the same path
      if (this.#created.has(file.path)) {
        this.#created.delete(file.path);
        file = { ...file, status: "modified" };
      }
    }

    switch (file.status) {
      case "created":
        this.#created.set(file.path, file);
        break;
      case "deleted":
        this.#deleted.set(file.path, file);
        break;
      case "modified":
        this.#modified.set(file.path, file);
        break;
      case "not_modified":
        this.#not_modified.set(file.path, file);
        break;
      default:
        throw new Error(`Unknown file status: ${file.status}`);
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
  public merge(source: FileState): this {
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

    return this;
  }

  get modified(): FileStatus[] {
    return Array.from(this.#modified.values());
  }

  get not_modified(): FileStatus[] {
    return Array.from(this.#not_modified.values());
  }

  get deleted(): FileStatus[] {
    return Array.from(this.#deleted.values());
  }

  get created(): FileStatus[] {
    return Array.from(this.#created.values());
  }

  /**
   * Creates a new FileState with reversed creation and deletion states.
   * Files that were created become deleted, and files that were deleted become created.
   * Modified and not_modified files remain unchanged.
   *
   * @returns A new FileState with reversed creation and deletion states
   */
  public reversed(): FileState {
    const reversedState = new FileState({
      // Swap created and deleted
      created: this.deleted.map((file) => ({ ...file, status: "created" })),
      deleted: this.created.map((file) => ({ ...file, status: "deleted" })),
      // Keep modified and not_modified as they are
      modified: this.modified,
      not_modified: this.not_modified,
    });

    return reversedState;
  }

  /**
   * Creates a new FileState with only the entries that pass the given predicate function.
   *
   * @param predicate - Function that tests each entry. Takes a FileStateEntry and returns a boolean.
   * @returns A new FileState containing only entries that pass the predicate test
   */
  public filter(
    predicate: (entry: FileStatus) => boolean,
  ): FileState {
    const result = new FileState();

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
      this.#modified.has(path) ||
      this.#not_modified.has(path) ||
      this.#deleted.has(path) ||
      this.#created.has(path)
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
      this.#created.size === 0;
  }

  /**
   * JSON object representation of the file state.
   */
  public toJSON() {
    return {
      created: this.created,
      modified: this.modified,
      not_modified: this.not_modified,
      deleted: this.deleted,
    };
  }

  [Symbol.for("Deno.customInspect")](): string {
    return JSON.stringify(this.toJSON(), null, 2);
  }
}
