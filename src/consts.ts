import { colors } from "@cliffy/ansi/colors";
import type { StatusResult } from "~/vt/lib/status.ts";

export const DEFAULT_BRANCH_NAME = "main";
export const API_KEY_KEY = "VAL_TOWN_API_KEY";

export const ALWAYS_IGNORE_PATTERNS: string[] = [
  ".vtignore",
  ".vt",
  ".env",
];

export const DEFAULT_IGNORE_PATTERNS: string[] = [
  "*~",
  "*.swp",
  ".env",
];

export const META_STATE_FILE_NAME = "state.json";
export const META_FOLDER_NAME = ".vt";
export const META_IGNORE_FILE_NAME = ".vtignore";

export const MAX_WALK_UP_LEVELS = 100;

export const FIRST_VERSION_NUMBER = 1;

export const STATUS_STYLES: Record<
  keyof StatusResult,
  { prefix: string; color: (text: string) => string }
> = {
  modified: { prefix: "M", color: colors.yellow },
  created: { prefix: "A", color: colors.green },
  deleted: { prefix: "D", color: colors.red },
  not_modified: { prefix: " ", color: colors.gray },
};

export const DEFAULT_VAL_TYPE = "script";

export const ProjectItems = [
  "script",
  "http",
  "email",
  "interval",
  "file",
  "directory",
] as const;

export const VAL_TOWN_PROJECT_URL_REGEX =
  /^http[s]?:\/\/www\.val\.town\/x\/([^\/]+)\/([^\/]+)$/;

export type ProjectItemType = typeof ProjectItems[number];
export type ProjectFileType = Exclude<ProjectItemType, "directory">;

export const JSON_INDENT_SPACES = 4;
