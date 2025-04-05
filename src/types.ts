import { ProjectItems } from "~/consts.ts";

export type ProjectItemType =
  | "script"
  | "http"
  | "email"
  | "interval"
  | "file"
  | "directory";

export type ProjectFileType = Exclude<ProjectItemType, "directory">;

/**
 * Cast a string to a ProjectItemType.
 *
 * @param value - The value to convert to a ProjectItemType
 * @returns The value as a ProjectItemType
 */
export function asProjectItemType(value: unknown): ProjectItemType {
  if (
    typeof value === "string" && ProjectItems.includes(value as ProjectItemType)
  ) return value as ProjectItemType;
  throw new Error("Unknown ProjectItemType: " + value);
}

/**
 * Cast a string to a ProjectFileType (which is a subset of ProjectItemType
 * without directories).
 *
 * @param value - The value to convert to a ProjectFileType
 * @returns The value as a ProjectFileType
 */
export function asProjectFileType(value: unknown): ProjectFileType {
  const projectFileTypes: ProjectFileType[] = ProjectItems.filter(
    (item) => item !== "directory",
  ) as ProjectFileType[];

  if (
    typeof value === "string" &&
    projectFileTypes.includes(value as ProjectFileType)
  ) return value as ProjectFileType;

  throw new Error("Unknown ProjectFileType: " + value);
}
