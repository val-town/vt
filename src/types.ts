export type ValItemType =
  | "script"
  | "http"
  | "email"
  | "interval"
  | "file"
  | "directory";

export type ValFileType = Exclude<ValItemType, "directory">;

export type ValPrivacy = "public" | "unlisted" | "private";
