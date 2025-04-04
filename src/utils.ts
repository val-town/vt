import { dirname } from "@std/path";
import { deepMerge } from "@std/collections/deep-merge";
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
 * Sets a value at a nested property path within an object and returns a new object.
 * Creates intermediate objects if they don't exist.
 *
 * @param obj - The source object (will not be modified)
 * @param path - A dot-separated string representing the property path (e.g., 'user.address.city')
 * @param value - The value to set at the specified path
 * @returns A new object with the value set at the specified path
 *
 * @example
 * const user = {};
 * const updatedUser = setNestedPropertyImmutable(user, 'profile.address.city', 'New York');
 * // Result: updatedUser = { profile: { address: { city: 'New York' } } }
 * // Original user object remains empty: {}
 */
export function setNestedProperty(
  obj: Record<string, unknown | Record<string, unknown>>,
  path: string,
  value: unknown,
): { [x: string]: unknown } {
  // Convert path like "foo.bar.buzz" to { foo: { bar: { buzz: value } } }
  const pathParts = path.split(".");
  const valueObj = pathParts
    .reduceRight((acc, part) => ({ [part]: acc }), value) as object;

  // Merge the new value object with the original object
  return deepMerge(obj, valueObj);
}
