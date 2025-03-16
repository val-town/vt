import { dirname, join } from "@std/path";
import { MAX_WALK_UP_LEVELS } from "~/consts.ts";

/**
 * Finds the nearest directory containing a .vt folder by climbing up the directory tree
 *
 * @param {string} startPath The path to start searching from
 * @param {number} maxLevels The maximum number of levels to walk up (default is MAX_WALK_UP_LEVELS)
 * @throw {Deno.errors.NotFound} If no .vt directory is found within the specified levels
 * @returns The path to the directory containing a .vt folder
 */
export async function findVtRoot(
  startPath: string,
  maxLevels: number = MAX_WALK_UP_LEVELS,
): Promise<string> {
  let currentPath = startPath;
  let levelsUp = 0;

  while (levelsUp < maxLevels) {
    try {
      // Check if .vt directory exists in the current path
      const vtDirPath = join(currentPath, ".vt");
      const stat = await Deno.stat(vtDirPath);

      if (stat.isDirectory) return currentPath;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }

    // Move up to parent directory
    const parentPath = dirname(currentPath);

    // If we've reached the root and can't go up further
    if (parentPath === currentPath) break;

    currentPath = parentPath;
    levelsUp++;
  }

  throw new Deno.errors.NotFound(
    `No .vt directory found in current path or any parent.`,
  );
}
