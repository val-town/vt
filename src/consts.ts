import { colors } from "@cliffy/ansi/colors";

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

export const STATUS_COLORS: Record<
  string,
  { prefix: string; color: (text: string) => string }
> = {
  modified: { prefix: "M", color: colors.yellow },
  created: { prefix: "A", color: colors.green },
  deleted: { prefix: "D", color: colors.red },
  not_modified: { prefix: " ", color: colors.gray },
};

export const VAL_TYPE_EXTENSIONS: Record<
  string,
  { abbreviated: string; standard: string }
> = {
  "script": { abbreviated: "S", standard: "script" },
  "http": { abbreviated: "H", standard: "http" },
  "email": { abbreviated: "E", standard: "email" },
  "interval": { abbreviated: "C", standard: "cron" },
};
