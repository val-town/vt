/**
 * The different types of project items.
 */
export type ProjectItemType =
  | "script"
  | "http"
  | "email"
  | "interval"
  | "file"
  | "directory";

/**
 * A project item, but not directories.
 */
export type ProjectFileType = Exclude<ProjectItemType, "directory">;

/**
 * The different project privacy levels.
 */
export type ProjectPrivacy = "public" | "unlisted" | "private";
