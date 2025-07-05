import { dirname } from "@std/path";
import { deepMerge } from "@std/collections/deep-merge";
import { MAX_WALK_UP_LEVELS } from "~/consts.ts";

/**
 * Finds the nearest directory that satisfies a root condition by climbing up
 * the directory tree
 *
 * @param startPath The path to start searching from
 * @param isRoot Callback function that determines if a path is a root
 * @param maxLevels The maximum number of levels to walk up (default is MAX_WALK_UP_LEVELS)
 * @throw If no root directory is found within the specified levels
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

  throw new Error("No root directory found within the specified levels.");
}

/**
 * Gets a value from a nested property path within an object.
 *
 * @param obj The source object
 * @param path A dot-separated string representing the property path (e.g., 'user.address.city')
 * @param defaultValue Value to return if path doesn't exist
 * @returns The value at the specified path or defaultValue if not found
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
 *
 * @param path Path to the directory to check
 * @returns Promise that resolves to whether the directory is empty
 */
export async function dirIsEmpty(path: string | URL): Promise<boolean> {
  const dirIter = Deno.readDir(path);
  const firstEntry = await dirIter[Symbol.asyncIterator]().next();
  return firstEntry.done === true;
}

/**
 * Whether a string contains a null byte. This is a heuristic val town uses to
 * detect whether a file is utf 8.
 *
 * @param str The string to check
 * @returns Whether the string contains a null byte
 */
export function hasNullBytes(str: string): boolean {
  return str.includes("\0");
}

/**
 * Collects a specified number of items from an asynchronous generator into an array.
 *
 * @param asyncGenerator An asynchronous generator function.
 * @param N Number of iterations to perform.
 * @returns A promise that resolves to an array containing the collected items and whether there are more items available.
 */
export async function arrayFromAsyncN<T>(
  asyncGenerator: AsyncIterable<T>,
  N: number,
): Promise<[T[], boolean]> {
  const results: T[] = [];
  const iterator = asyncGenerator[Symbol.asyncIterator]();
  let count = 0;
  let hasMore = false;

  while (count < N) {
    const { value, done } = await iterator.next();
    if (done) break;
    results.push(value);
    count++;
  }

  // Check if there's at least one more item available
  if (count === N) {
    const { done } = await iterator.next();
    hasMore = !done;
  }

  return [results, hasMore];
}

/**
 * Ensures a file path uses POSIX-style forward slashes.
 * Converts Windows backslashes to forward slashes for API compatibility.
 * Also handles absolute Windows paths (C:\path) by removing drive letters.
 *
 * @param path The file path to normalize
 * @returns The path with forward slashes, relative paths preserved
 */
export function asPosixPath(path: string): string {
  // Convert backslashes to forward slashes
  let normalized = path.replace(/\\/g, "/");

  // Handle absolute Windows paths (C:/ or C:\) and bare drive letters (C:)
  // Remove drive letter and colon for absolute paths
  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = normalized.substring(2);
  } else if (/^[a-zA-Z]:$/.test(normalized)) {
    // Handle bare drive letter like "C:"
    normalized = "";
  }

  return normalized;
}
