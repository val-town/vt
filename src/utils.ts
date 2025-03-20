import { dirname, globToRegExp } from "@std/path";
import { MAX_WALK_UP_LEVELS } from "~/consts.ts";

/**
 * Checks if a directory is empty, ignoring files that match specified glob patterns.
 *
 * @param path - Directory path to check
 * @param gitignoreRules - Gitignore rules
 * @returns True if directory is empty (after ignoring specified files)
 *
 * @example
 * await isDirectoryEmpty("./mydir", [".git/**"]);
 */
export async function isDirectoryEmpty(
  path: string | URL,
  gitignoreRules: string[] = [],
): Promise<boolean> {
  const ignorePatterns = gitignoreRules.map((glob) => globToRegExp(glob));

  for await (const entry of Deno.readDir(path)) {
    // Check if entry matches any ignore pattern
    const shouldIgnore = ignorePatterns.some((pattern) =>
      pattern.test(entry.name)
    );
    if (!shouldIgnore) {
      return false;
    }
  }
  return true;
}

export async function removeEmptyDirs(dir: string) {
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isDirectory) continue;

    const path = `${dir}/${entry.name}`;
    await removeEmptyDirs(path);

    try {
      await Deno.remove(path);
    } catch {
      // the errors are for deleting non empty dirs
    }
  }
}

/**
 * Validates and ensures a directory exists and is empty. Creates the directory
 * if it doesn't exist.
 *
 * @param rootPath - The full path to the directory to check/create
 * @param options - Configuration options
 * @param options.gitignoreRules - Gitignore rules
 * @throws {Deno.errors.NotADirectory} if the path exists but is not a directory
 * @throws {Deno.errors.AlreadyExists} if the directory exists but is not empty
 */
export async function checkDirectory(
  rootPath: string,
  options: { gitignoreRules?: string[] } = {},
) {
  const { gitignoreRules: gitignoreRules = [] } = options;

  try {
    const stat = await Deno.lstat(rootPath);

    if (!stat.isDirectory) {
      throw new Deno.errors.NotADirectory(
        `"${rootPath}" exists but is not a directory.`,
      );
    }
  } catch (error) {
    // If directory doesn't exist, create it
    if (error instanceof Deno.errors.NotFound) {
      await Deno.mkdir(rootPath, { recursive: true });
      return; // Directory is newly created so we know it's empty
    }
    throw error; // Re-throw any other errors
  }

  // Check if existing directory is empty (considering ignored patterns)
  if (!(await isDirectoryEmpty(rootPath, gitignoreRules))) {
    throw new Deno.errors.AlreadyExists(
      `"${rootPath}" already exists and is not empty.`,
    );
  }
}

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

  throw new Deno.errors.NotFound();
}

/**
 * Converts a string to sentence case (capitalizes only the first letter)
 * while preserving all other characters exactly as they are.
 *
 * @param {string} text - The input text to format
 * @returns {string} Text with only the first letter capitalized
 */
export function sentenceCase(text: string) {
  // Handle empty or non-string inputs
  if (!text || typeof text !== "string" || text.length === 0) return "";

  // Capitalize only the first letter and keep the rest unchanged
  return text.charAt(0).toUpperCase() + text.slice(1);
}
