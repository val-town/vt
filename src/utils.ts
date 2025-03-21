import { dirname } from "@std/path";
import { MAX_WALK_UP_LEVELS } from "~/consts.ts";
import { shouldIgnore } from "~/vt/lib/paths.ts";

/**
 * Validates and ensures a directory exists and is empty. Creates the directory
 * if it doesn't exist.
 *
 * @param rootPath - The full path to the directory to check/create
 * @param options - Configuration options
 * @param options.gitignoreRules - Gitignore rules to use when checking if directory is empty
 * @returns True if the directory was created or is empty after ignoring specified files
 * @throws {Deno.errors.NotADirectory} if the path exists but is not a directory
 * @throws {Deno.errors.AlreadyExists} if the directory exists but is not empty
 *
 * @example
 * await checkDirectory("./mydir", { gitignoreRules: [".git/**"] });
 */
export async function checkDirectory(
  rootPath: string,
  options: { gitignoreRules?: string[] } = {},
): Promise<boolean> {
  const { gitignoreRules = [] } = options;

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
      return true; // Directory is newly created so we know it's empty
    }
    throw error; // Re-throw any other errors
  }

  // Check if existing directory is empty (considering ignored patterns)
  for await (const entry of Deno.readDir(rootPath)) {
    if (!(await shouldIgnore(entry.name, gitignoreRules, rootPath))) {
      throw new Deno.errors.AlreadyExists(
        `"${rootPath}" already exists and is not empty.`,
      );
    }
  }

  return true; // Directory exists and is empty (after applying ignore rules)
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
export function sentenceCase(text: string): string {
  // Handle empty or non-string inputs
  if (!text || typeof text !== "string" || text.length === 0) return "";

  // Capitalize only the first letter and keep the rest unchanged
  return text.charAt(0).toUpperCase() + text.slice(1);
}
