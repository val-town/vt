import { colors } from "@cliffy/ansi/colors";

export const DEFAULT_BRANCH_NAME = "main";
export const API_KEY_KEY = "VAL_TOWN_API_KEY";

export const ALWAYS_IGNORE_PATTERNS: string[] = [
  ".vtignore",
  ".vt/**",
  ".vt",
  ".env",
];

export const DEFAULT_IGNORE_PATTERNS: string[] = [
  "*~",
  "*.swp",
  ".env",
];

export const CONFIG_FILE_NAME = "vt.json";
export const META_FOLDER_NAME = ".vt";
export const META_IGNORE_FILE_NAME = ".vtignore";
export const META_LOCK_FILE_NAME = "lock";

export const MAX_WALK_UP_LEVELS = 100;

export const FIRST_VERSION_NUMBER = 1;

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
