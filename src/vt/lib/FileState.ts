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
  modified: FileStatus[] = [];
  not_modified: FileStatus[] = [];
  deleted: FileStatus[] = [];
  created: FileStatus[] = [];

  /**
   * Creates a new FileState instance with empty arrays or
   * initializes it with the provided state.
   *
   * @param initialState - Optional initial state to use
   */
  constructor(initialState?: Partial<FileState>) {
    if (initialState) {
      Object.assign(this, initialState);
    }
  }

  /**
   * Creates an empty FileState object with initialized empty arrays
   * for all status categories.
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
  insert(file: FileStatus): this {
    // Find if the file exists in any category
    const findInCategory = (
      category: FileStatusType,
    ): FileStatus | undefined => {
      return this[category].find((item) => item.path === file.path);
    };

    // Remove file from a category if it exists
    const removeFromCategory = (
      category: FileStatusType,
      path: string,
    ): void => {
      this[category] = this[category].filter((item) => item.path !== path);
    };

    // Handle different state transitions based on current status and new status
    switch (file.status) {
      case "created":
        // If file was previously deleted, mark as modified instead
        if (findInCategory("deleted")) {
          removeFromCategory("deleted", file.path);
          this.modified.push({ ...file, status: "modified" });
        } // If file already exists in any other category, it can't be newly created
        else if (findInCategory("modified") || findInCategory("not_modified")) {
          // Update to modified if it exists
          removeFromCategory("modified", file.path);
          removeFromCategory("not_modified", file.path);
          this.modified.push({ ...file, status: "modified" });
        } else {
          // It's a genuinely new file
          this.created.push(file);
        }
        break;

      case "deleted":
        // If file was newly created and now deleted, remove it completely
        if (findInCategory("created")) {
          removeFromCategory("created", file.path);
        } // Otherwise mark as deleted
        else if (!findInCategory("deleted")) {
          removeFromCategory("modified", file.path);
          removeFromCategory("not_modified", file.path);
          this.deleted.push(file);
        }
        break;

      case "modified":
        // Remove from other categories and add to modified
        removeFromCategory("created", file.path);
        removeFromCategory("not_modified", file.path);
        removeFromCategory("deleted", file.path);

        // Only add if not already in modified
        if (!findInCategory("modified")) {
          this.modified.push(file);
        }
        break;

      case "not_modified":
        // Only add if file doesn't exist in any category
        if (
          !findInCategory("created") &&
          !findInCategory("modified") &&
          !findInCategory("deleted") &&
          !findInCategory("not_modified")
        ) {
          this.not_modified.push(file);
        }
        break;
    }

    return this;
  }

  /**
   * Merges a source FileState object into the current instance.
   * @param source - The FileState object to merge from
   */
  merge(source: FileState): this {
    const categories: FileStatusType[] = [
      "modified",
      "not_modified",
      "deleted",
      "created",
    ];

    // Insert each file from the source state
    for (const category of categories) {
      for (const file of source[category]) {
        this.insert(file);
      }
    }

    return this;
  }
}
