import { colors } from "jsr:@cliffy/ansi@^1.0.0-rc.7/colors";

export const DEFAULT_BRANCH_NAME = "main";
export const API_KEY_KEY = "VAL_TOWN_API_KEY";

export const DEFAULT_IGNORE_PATTERNS: string[] = [
  ".vtignore",
  ".vt/**",
  ".vt",
];

export const CONFIG_FILE_NAME = "vt.json";
export const META_FOLDER_NAME = ".vt";
export const META_IGNORE_FILE_NAME = ".vtignore";
export const META_LOCK_FILE_NAME = "lock";

export const STATUS_COLORS: Record<
  string,
  { prefix: string; color: (text: string) => string }
> = {
  modified: { prefix: "M", color: colors.yellow },
  created: { prefix: "A", color: colors.green },
  deleted: { prefix: "D", color: colors.red },
  not_modified: { prefix: " ", color: colors.gray },
};

export const DEFAULT_VAL_TYPE = "script";

export type ProjectItem =
  | "script"
  | "http"
  | "email"
  | "interval"
  | "file"
  | "directory";
