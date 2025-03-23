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

export function newFileStateChanges(): FileStateChanges {
  return {
    modified: [],
    not_modified: [],
    deleted: [],
    created: [],
  } as FileStateChanges;
}
