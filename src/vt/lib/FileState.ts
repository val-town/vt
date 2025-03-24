import type { ProjectItemType } from "~/consts.ts";

export interface FileInfo {
  mtime: number;
  type: ProjectItemType;
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
  #modified: Set<FileStatus>;
  #not_modified: Set<FileStatus>;
  #deleted: Set<FileStatus>;
  #created: Set<FileStatus>;

  public constructor(
    initialState?: Partial<{
      modified?: FileStatus[];
      not_modified?: FileStatus[];
      deleted?: FileStatus[];
      created?: FileStatus[];
    }>,
  ) {
    this.#modified = new Set<FileStatus>(initialState?.modified || []);
    this.#not_modified = new Set<FileStatus>(initialState?.not_modified || []);
    this.#deleted = new Set<FileStatus>(initialState?.deleted || []);
    this.#created = new Set<FileStatus>(initialState?.created || []);
  }

  /**
   * Creates an empty FileState object with initialized empty sets for all
   * status categories.
   */
  static empty(): FileState {
    return new FileState();
  }

  /**
   * Inserts a file with the specified status, automatically handling transitions
   * between states based on existing entries.
   *
   * @param file - The file status to insert
   */
  public insert(file: FileStatus): this {
    if (file.path.length === 0) throw new Error("File path cannot be empty");

    switch (file.status) {
      case "created":
        this.#created.add(file);
        break;
      case "deleted":
        this.#deleted.add(file);
        break;
      case "modified":
        this.#modified.add(file);
        break;
      case "not_modified":
        this.#not_modified.add(file);
        break;
      default:
        throw new Error(`Unknown file status: ${file.status}`);
    }

    return this;
  }

  /**
   * Merges a source FileState object into the current instance.
   * @param source - The FileState object to merge from
   */
  public merge(source: FileState): this {
    for (const file of source.modified) this.insert(file);
    for (const file of source.not_modified) this.insert(file);
    for (const file of source.deleted) this.insert(file);
    for (const file of source.created) this.insert(file);

    return this;
  }

  get modified(): FileStatus[] {
    return [...this.#modified];
  }
  get not_modified(): FileStatus[] {
    return [...this.#not_modified];
  }
  get deleted(): FileStatus[] {
    return [...this.#deleted];
  }
  get created(): FileStatus[] {
    return [...this.#created];
  }

  /**
   * Determines if this FileState has any files in any state.
   * Returns true if there are files, false if all sets are empty.
   */
  public isEmpty(): boolean {
    return this.#modified.size === 0 &&
      this.#not_modified.size === 0 &&
      this.#deleted.size === 0 &&
      this.#created.size === 0;
  }

  public toJSON() {
    return {
      created: this.created,
      modified: this.modified,
      not_modified: this.not_modified,
      deleted: this.deleted,
    };
  }
}
