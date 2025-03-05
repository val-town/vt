import { walk } from "@std/fs";
import { tgz } from "jsr:@deno-library/compress";
import { shouldIgnoreGlob } from "~/vt/git/paths.ts";
import { basename } from "@std/path/basename";

export interface StashListingInfo {
  timestamp: number;
  date: Date;
  path: string;
  name?: string;
}

/**
 * Stores or applies a project snapshot using tgz compression.
 *
 * @param projectDir - The project directory path
 * @param snapshotPath - The path for the snapshot file
 * @param mode - Either "store" to create snapshot or "apply" to restore from snapshot
 * @param ignoreGlobs - Optional array of glob patterns to ignore
 * @param stashName - Optional name for the stash
 */
export async function stash(
  {
    projectDir,
    snapshotPath,
    mode,
    ignoreGlobs,
    stashName,
  }: {
    projectDir: string;
    snapshotPath: string;
    mode: "apply" | "store" | "delete";
    ignoreGlobs?: string[];
    stashName?: string;
  },
): Promise<StashListingInfo>;

/**
 * Lists all available snapshots in the stash directory.
 *
 * @param projectDir - The project directory path
 * @param stashDir - The directory containing snapshots
 * @returns Array of snapshot information
 */
export async function stash(
  {
    projectDir,
    stashDir,
    mode,
  }: {
    projectDir: string;
    stashDir: string;
    mode: "list";
  },
): Promise<StashListingInfo[]>;

export async function stash(
  {
    projectDir,
    snapshotPath,
    stashDir,
    mode,
    ignoreGlobs,
    stashName,
  }: {
    projectDir: string;
    snapshotPath?: string;
    stashDir?: string;
    mode: "store" | "apply" | "delete" | "list";
    ignoreGlobs?: string[];
    stashName?: string;
  },
): Promise<StashListingInfo | StashListingInfo[]> {
  switch (mode) {
    case "store": {
      if (!snapshotPath) {
        throw new Error("Snapshot path required for store mode");
      }

      const finalPath = stashName
        ? generateStashFilename(snapshotPath, stashName)
        : snapshotPath;

      await tgz.compress(projectDir, finalPath, {
        excludeSrc: true,
        debug: false,
        filter: (path: string) => !shouldIgnoreGlob(path, ignoreGlobs),
      });

      return getStashInfo(finalPath);
    }

    case "apply": {
      if (!snapshotPath) {
        throw new Error("Snapshot path required for apply mode");
      }
      for await (const entry of walk(projectDir)) {
        if (!shouldIgnoreGlob(entry.path, ignoreGlobs)) {
          await Deno.remove(entry.path, { recursive: true });
        }
      }
      await tgz.uncompress(snapshotPath, projectDir, {
        debug: false,
      });
      return getStashInfo(snapshotPath);
    }

    case "delete": {
      if (!snapshotPath) {
        throw new Error("Snapshot path required for delete mode");
      }
      const info = getStashInfo(snapshotPath);
      await Deno.remove(snapshotPath);
      return info;
    }

    case "list": {
      if (!stashDir) throw new Error("Stash directory required for list mode");
      const files = Deno.readDirSync(stashDir);
      return Array.from(files)
        .filter((file) => file.name.endsWith(".tar.gz"))
        .map((file) => getStashInfo(`${stashDir}/${file.name}`))
        .sort((a, b) => b.timestamp - a.timestamp);
    }

    default:
      throw new Error(`Invalid mode: ${mode}`);
  }
}

/**
 * Parses stash information from a filename
 */
function parseStashFilename(
  filename: string,
): { timestamp: string; name?: string } {
  const base = basename(filename, ".tar.gz");
  const [timestamp, ...nameParts] = base.split(".");
  const name = nameParts.length > 0 ? nameParts.join(".") : undefined;
  return { timestamp, name };
}

/**
 * Generates a stash filename with optional name
 */
function generateStashFilename(basePath: string, stashName?: string): string {
  if (!stashName) return basePath;

  const { timestamp } = parseStashFilename(basePath);
  const dir = basePath.substring(0, basePath.lastIndexOf("/") + 1);
  return `${dir}${timestamp}.${stashName}.tar.gz`;
}

/**
 * Creates a StashListingInfo object from a stash path
 */
function getStashInfo(path: string): StashListingInfo {
  const { timestamp, name } = parseStashFilename(path);
  return {
    timestamp: parseInt(timestamp),
    date: new Date(parseInt(timestamp)),
    path,
    name,
  };
}
