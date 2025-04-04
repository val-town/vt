//deno-fmt-ignore-file
import { colors } from "@cliffy/ansi/colors";
import { join } from "@std/path";
import xdg from "xdg";

export const DEFAULT_BRANCH_NAME = "main";
export const PROGRAM_NAME = "vt";
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
export const VT_CONFIG_FILE_NAME = "config.yaml";
export const META_FOLDER_NAME = ".vt";
export const ENTRYPOINT_NAME = "vt.ts"
export const META_IGNORE_FILE_NAME = ".vtignore";
export const GLOBAL_VT_CONFIG_PATH = join(xdg.config(), PROGRAM_NAME);

export const MAX_WALK_UP_LEVELS = 100;

export const FIRST_VERSION_NUMBER = 0;

export const STATUS_STYLES: Record< string, { prefix: string; color: (key: string) => string } > = {
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

export const JSON_INDENT_SPACES = 4;

export const ProjectItemColors: Record<ProjectItemType, (s: string) => string> =
  {
    "script": (s: string) => colors.rgb24(s, 0x4287f5),
    "http": (s: string) => colors.rgb24(s, 0x22c55e),
    "interval": (s: string) => colors.rgb24(s, 0xd946ef),
    "email": (s: string) => colors.rgb24(s, 0x8b5cf6),
    "file": (s: string) => colors.dim(s),
    "directory": (s: string) => colors.dim(s),
  };

export const TypeToTypeStr: Record<ProjectItemType, string> = {
  "script": "script",
  "http": "http",
  "email": "email",
  "interval": "cron",
  "file": "file",
  "directory": "directory",
};

export const VAL_TOWN_PROJECT_URL_REGEX = /^http[s]?:\/\/www\.val\.town\/x\/([^\/]+)\/([^\/]+)$/;

export type ProjectItemType = typeof ProjectItems[number];
export type ProjectFileType = Exclude<ProjectItemType, "directory">;

export const RECENT_VERSION_COUNT = 5;
