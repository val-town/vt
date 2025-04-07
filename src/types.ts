export type ProjectItemType =
  | "script"
  | "http"
  | "email"
  | "interval"
  | "file"
  | "directory";

export type ProjectFileType = Exclude<ProjectItemType, "directory">;
