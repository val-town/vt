/**
 * The different types of project items.
 */
export type ValItemType =
  | "script"
  | "http"
  | "email"
  | "interval"
  | "file"
  | "directory";

/**
 * A project item, but not directories.
 */
export type ProjectFileType = Exclude<ValItemType, "directory">;

/**
 * The different project privacy levels.
 */
export type ProjectPrivacy = "public" | "unlisted" | "private";
export type ValFileType = Exclude<ValItemType, "directory">;

export type ValPrivacy = "public" | "unlisted" | "private";
