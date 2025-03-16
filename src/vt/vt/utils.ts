import { dirname, join } from "@std/path";
import { MAX_WALK_UP_LEVELS } from "~/consts.ts";

/**
 * Finds the nearest directory containing a .vt folder by climbing up the directory tree
 * @param startPath The path to start searching from
 * @returns The path to the directory containing a .vt folder, or the original path if none found
 */
export async function findVTRoot(
  startPath: string,
  maxLevels = MAX_WALK_UP_LEVELS,
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
