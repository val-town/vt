import { colors } from "@cliffy/ansi/colors";
import type { ValItemType } from "~/types.ts";
import { join } from "@std/path";
import xdg from "xdg-portable";
import type { ItemWarning } from "~/vt/lib/utils/ItemStatusManager.ts";

export const DEFAULT_BRANCH_NAME = "main";
export const PROGRAM_NAME = "vt";
export const API_KEY_KEY = "VAL_TOWN_API_KEY";

export const ALWAYS_IGNORE_PATTERNS: string[] = [
  ".vt",
  ".env",
];

export const DEFAULT_IGNORE_PATTERNS: string[] = [
  "*~",
  "*.swp",
  ".env",
];

export const DEFAULT_VAL_PRIVACY = "public";
export const META_STATE_FILE_NAME = "state.json";
export const VT_CONFIG_FILE_NAME = "config.yaml";
export const META_FOLDER_NAME = ".vt";
export const ENTRYPOINT_NAME = "vt.ts";
export const META_IGNORE_FILE_NAME = ".vtignore";
export const GLOBAL_VT_CONFIG_PATH = join(xdg.config(), PROGRAM_NAME);

export const DEFAULT_WRAP_WIDTH = 80;
export const MAX_WALK_UP_LEVELS = 100;

export const FIRST_VERSION_NUMBER = 0;

export const STATUS_STYLES: Record<
  string,
  { prefix: string; color: (key: string) => string }
> = {
  modified: { prefix: "M", color: colors.yellow },
  renamed: { prefix: "R", color: (str: string) => colors.rgb24(str, 0xff87d6) },
  created: { prefix: "A", color: colors.green },
  deleted: { prefix: "D", color: colors.red },
  not_modified: { prefix: " ", color: colors.gray },
};

export const WARNING_MESSAGES: Record<ItemWarning, string> = {
  "bad_name": "Invalid file name",
  "binary": "File has binary content",
  "empty": "File is empty",
  "too_large": "File is too large",
};

export const DEFAULT_VAL_TYPE = "script";

export const ValItems = [
  "script",
  "http",
  "email",
  "interval",
  "file",
  "directory",
];

export const JSON_INDENT_SPACES = 4;

export const ValItemColors: Record<ValItemType, (s: string) => string> = {
  "script": (s: string) => colors.rgb24(s, 0x4287f5),
  "http": (s: string) => colors.rgb24(s, 0x22c55e),
  "interval": (s: string) => colors.rgb24(s, 0xd946ef),
  "email": (s: string) => colors.rgb24(s, 0x8b5cf6),
  "file": (s: string) => colors.dim(s),
  "directory": (s: string) => colors.dim(s),
};

export const TypeToTypeStr: Record<ValItemType, string> = {
  "script": "script",
  "http": "http",
  "email": "email",
  "interval": "cron",
  "file": "file",
  "directory": "directory",
};

export const VAL_TOWN_VAL_URL_REGEX = /val\.town\/x\/([^\/]+)\/([^\/]+)/;

export const RECENT_VERSION_COUNT = 5;

// https://git-scm.com/docs/git-diff/2.12.5 (see --find-renames, git defaults
// to 50%)
export const RENAME_DETECTION_THRESHOLD = 0.5;
export const GET_API_KEY_URL = "https://www.val.town/settings/api";
export const VT_README_URL =
  "https://github.com/val-town/vt/blob/main/README.md";
export const TYPE_PRIORITY: Record<ValItemType, number> = {
  "script": 0,
  "email": 1,
  "http": 2,
  "directory": 3,
  "file": 4,
  "interval": 5,
};

export const VAL_ITEM_NAME_REGEX = new RegExp("^[a-zA-Z0-9\\-_.]+$");
export const MAX_FILENAME_LENGTH = 80;
export const MAX_FILE_CHARS = 80_000;
export const DEFAULT_EDITOR_TEMPLATE = "std/vtEditorFiles";

export const AUTH_CACHE_TTL = 60 * 60 * 1000; // 1 hour
export const AUTH_CACHE_LOCALSTORE_ENTRY = "vt_last_auth_cache";
