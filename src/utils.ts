import { dirname } from "@std/path";
import { MAX_WALK_UP_LEVELS } from "~/consts.ts";

/**
 * Finds the nearest directory that satisfies a root condition by climbing up
 * the directory tree
 *
 * @param {string} startPath The path to start searching from
 * @param {(path: string) => Promise<boolean>} isRoot Callback function that determines if a path is a root
 * @param {number} maxLevels The maximum number of levels to walk up (default is MAX_WALK_UP_LEVELS)
 * @throw {Deno.errors.NotFound} If no root directory is found within the specified levels
 * @returns The path to the directory that satisfies the root condition
 */
export async function findRoot(
  startPath: string,
  isRoot: (path: string) => Promise<boolean>,
  maxLevels: number = MAX_WALK_UP_LEVELS,
): Promise<string> {
  let currentPath = startPath;
  let levelsUp = 0;

  while (levelsUp < maxLevels) {
    try {
      // Check if current path satisfies the root condition
      if (await isRoot(currentPath)) return currentPath;
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }

    // Move up to parent directory
    const parentPath = dirname(currentPath);

    // If we've reached the root and can't go up further
    if (parentPath === currentPath) break;

    currentPath = parentPath;
    levelsUp++;
  }

  throw new Deno.errors.NotFound();
}

/**
 * Checks if a directory is empty asynchronously.
 * @param path Path to the directory to check
 * @returns Promise that resolves to true if the directory is empty, false otherwise
 * @throws Will throw an error if the path doesn't exist or isn't a directory
 */
export async function dirIsEmpty(path: string | URL): Promise<boolean> {
  const dirIter = Deno.readDir(path);
  const firstEntry = await dirIter[Symbol.asyncIterator]().next();
  return firstEntry.done === true;
}
