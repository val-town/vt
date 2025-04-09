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
 * Gets a value from a nested property path within an object.
 *
 * @param obj - The source object
 * @param path - A dot-separated string representing the property path (e.g., 'user.address.city')
 * @param defaultValue - Value to return if path doesn't exist
 * @returns The value at the specified path or defaultValue if not found
 *
 * @example
 * const city = getNestedProperty(user, 'profile.address.city', 'Unknown');
 */
export function getNestedProperty(
  obj: Record<string, unknown>,
  path: string,
  defaultValue: unknown = undefined,
): unknown {
  const pathParts = path.split(".");
  const [firstPart, ...restParts] = pathParts;

  // Base case: if no more path parts, return current value
  if (pathParts.length === 0) return obj;

  // If obj is null or not an object, return default value
  if (obj == null || typeof obj !== "object") return defaultValue;

  const currentValue = obj[firstPart];

  // If we've reached the end of the path, return the value
  if (restParts.length === 0) {
    return currentValue === undefined ? defaultValue : currentValue;
  }

  // Recurse with the next level and the remaining path
  return getNestedProperty(
    currentValue as Record<string, unknown>,
    restParts.join("."),
    defaultValue,
  );
}

/**
 * Sets a value at a nested property path and returns a new object.
 * Creates intermediate objects if needed.
 *
 * @param obj - The source object (not modified)
 * @param path - Dot-separated property path (e.g., 'user.address.city')
 * @param value - The value to set
 * @returns A new object with the updated path
 *
 * @example
 * const updatedUser = setNestedProperty(user, 'profile.address.city', 'New York');
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
