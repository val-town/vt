import * as path from "@std/path";
import { DEFAULT_VAL_TYPE, ProjectItem } from "~/consts.ts";
import { filePathToFile } from "~/sdk.ts";

/**
 * Determine the type of a project file.
 *
 * This function attempts to determine the type of a file within a project
 * based on its existing state on the server or its filename. The process...
 * 1. Check if the file already exists in the project at the specified path.
 * 2. If the file does not exist, determine its type based on its file extension:
 *    - Files ending in .ts, .tsx, .js, or .jsx are considered "val" files.
 *    - Check the filename for keywords like "cron", "http", or "email" to
 *      determine specific types:
 *      - If multiple keywords are found, default to "script".
 *      - Otherwise, return "interval" for "cron", "http" for "http", etc
 *      - Default to "script" if no keywords are found.
 * 3. If the file does not match the val extension criteria (.ts + optional
 *    identifier), return "file".
 *
 * @param filepath - Path or filename to analyze
 * @returns The val file type
 */
async function getProjectItemType(
  projectId: string,
  branchId: string,
  version: number,
  filePath: string,
): Promise<ProjectItem> {
  try {
    // If a file already exists in the project at the given path, then the type
    // is whatever it already is on the website.
    return await filePathToFile(projectId, branchId, version, filePath)
      .then((resp) => resp.type);
  } catch (e) {
    // Otherwise, if it ends in .ts, .js, .tsx, or .jsx, it is a val
    if (e instanceof Deno.errors.NotFound) {
      if (/\.(ts|tsx|js|jsx)$/.test(filePath)) {
        const isCron = filePath.includes("cron");
        const isHttp = filePath.includes("http");
        const isEmail = filePath.includes("email");

        // If it's ambiguous then it is a script val by default
        if ([isCron, isHttp, isEmail].filter(Boolean).length > 1) {
          return DEFAULT_VAL_TYPE;
        }

        // But otherwise look at the file name and try to figure out what type
        // of val it is based on whether the file name contains a pattern like
        // "cron," etc
        if (isCron) return "interval";
        if (isHttp) return "http";
        if (isEmail) return "email";

        // If we can't figure it out, default to script
        return DEFAULT_VAL_TYPE;
      }

      // Otherwise, it's just a plain old file val
      return "file";
    } else {
      // Re-throw any other errors
      throw e;
    }
  }
}

/**
 * Checks if a path should be ignored based on ignore patterns, using
 * .gitignore rules.
 *
 * This function implements gitignore-style pattern matching with the following behavior:
 *
 * 1. Patterns are processed in order from top to bottom
 * 2. Negated patterns (starting with !) can re-include a previously excluded file
 * 3. The last matching pattern determines the outcome
 * 4. Patterns ending with "/" only match directories
 * 5. Patterns starting with "/" are anchored to the base directory
 * 6. Patterns without leading "/" can match anywhere in subdirectories
 *
 * Example patterns:
 * - "*.log" - Ignores all .log files in any directory
 * - "/build/" - Ignores only the build directory in the root
 * - "node_modules/" - Ignores all node_modules directories
 * - "!important.log" - Re-includes important.log even if it matches a previous pattern
 *
 * @param {string} filePath - Path to check
 * @param {string[]} ignoreGlobs - Array of glob patterns to check against
 * @returns {boolean} True if the path should be ignored
 */
function shouldIgnore(
  filePath: string,
  ignoreGlobs: string[] = [],
): boolean {
  // Split ignoreGlobs into normal and negated patterns while preserving order
  const patterns: Array<{ pattern: string; negated: boolean }> = ignoreGlobs
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((glob) => ({
      pattern: glob.startsWith("!") ? glob.slice(1) : glob,
      negated: glob.startsWith("!"),
    }));

  // gitignore logic: last matching pattern determines the outcome
  let ignored = false;

  for (const { pattern, negated } of patterns) {
    // Create RegExp for this specific pattern
    let regexPattern: RegExp;

    // Handle directory-specific patterns
    const dirOnly = pattern.endsWith("/");
    const cleanPattern = dirOnly ? pattern.slice(0, -1) : pattern;

    // Handle absolute vs relative patterns
    if (cleanPattern.startsWith("/")) {
      // Absolute pattern - anchored to the base directory
      regexPattern = path.globToRegExp(cleanPattern, {
        extended: true,
        globstar: true,
      });
    } else {
      // Relative pattern - can match anywhere in subdirectories
      regexPattern = path.globToRegExp(`**/${cleanPattern}`, {
        extended: true,
        globstar: true,
      });
    }

    if (regexPattern.test(filePath)) ignored = !negated;
  }

  return ignored;
}

export { getProjectItemType, shouldIgnore };
