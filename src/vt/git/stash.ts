import { tgz } from "jsr:@deno-library/compress";
import { shouldIgnoreGlob } from "~/vt/git/paths.ts";
import { basename } from "@std/path/basename";
import { join } from "@std/path";

export interface StashListingInfo {
  timestamp: number;
  date: Date;
  path: string;
  name: string;
}

/**
 * Stores, applies, or deletes a project snapshot using tgz compression.
 *
 * @param projectDir - The project directory path
 * @param stashDir - The directory for storing snapshots
 * @param mode - The operation mode: "store", "apply", or "delete"
 * @param ignoreGlobs - Optional array of glob patterns to ignore
 * @param name - Name for the stash (required for store/apply/delete)
 */
export async function stash(
  {
    projectDir,
    stashDir,
    mode,
    ignoreGlobs,
    name,
  }: {
    projectDir: string;
    stashDir: string;
    mode: "store" | "apply" | "delete";
    ignoreGlobs?: string[];
    name: string;
  },
): Promise<StashListingInfo>;

/**
 * Lists all available snapshots in the stash directory.
 *
 * @param projectDir - The project directory path
 * @param stashDir - The directory containing snapshots
 * @param mode - Must be "list"
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
    stashDir,
    mode,
    ignoreGlobs,
    name,
  }: {
    projectDir: string;
    stashDir: string;
    mode: "store" | "apply" | "delete" | "list";
    ignoreGlobs?: string[];
    name?: string;
  },
): Promise<StashListingInfo | StashListingInfo[]> {
  switch (mode) {
    case "store": {
      if (!name) throw new Error("Name is required for store mode");
      const timestamp = Date.now();
      const finalPath = getStashFilename(stashDir, timestamp, name);

      await tgz.compress(projectDir, finalPath, {
        excludeSrc: true,
        debug: false,
        filter: (path: string) => !shouldIgnoreGlob(path, ignoreGlobs),
      });

      return getStashListing(finalPath);
    }

    case "apply": {
      if (!name) throw new Error("Name is required for apply mode");
      const stash = await getStashByName(stashDir, name);
      if (!stash) throw new Error(`No stash found with name: ${name}`);

      await tgz.uncompress(stash.path, projectDir, { debug: false });
      return stash;
    }

    case "delete": {
      if (!name) throw new Error("Name is required for delete mode");
      const stash = await getStashByName(stashDir, name);
      if (!stash) throw new Error(`No stash found with name: ${name}`);

      await Deno.remove(stash.path);
      return stash;
    }

    case "list": {
      const files = Deno.readDirSync(stashDir);
      return Array.from(files)
        .filter((file) => file.name.endsWith(".tar.gz"))
        .map((file) => getStashListing(`${stashDir}/${file.name}`))
        .sort((a, b) => b.timestamp - a.timestamp);
    }

    default:
      throw new Error(`Invalid mode: ${mode}`);
  }
}

/**
 * Parses stash information from a filename
 */
function getStashListing(
  path: string,
): StashListingInfo {
  const base = basename(path, ".tar.gz");
  const [timestamp, ...nameParts] = base.split(".");
  const name = nameParts.join(".");
  return {
    timestamp: parseInt(timestamp),
    date: new Date(parseInt(timestamp)),
    path,
    name,
  };
}

/**
 * Generates a stash filename with timestamp and name
 */
function getStashFilename(
  stashDir: string,
  timestamp: number,
  name: string,
): string {
  return join(stashDir, `${timestamp}.${name}.tar.gz`);
}

/**
 * Get a stash by its name
 */
async function getStashByName(stashDir: string, name: string) {
  const contents = await stash({
    projectDir: stashDir,
    stashDir,
    mode: "list",
  });
  return contents.find((content) => content.name === name);
}
