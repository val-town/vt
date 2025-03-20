import { DEFAULT_VAL_TYPE, type ProjectItemType } from "~/consts.ts";
import { filePathToFile } from "~/sdk.ts";
import { compile as compileGitignore } from "gitignore-parser";

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
): Promise<ProjectItemType> {
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
 * Checks if a path should be ignored based on gitignore rules.
 *
 * @param {string} filePath - Path to check
 * @param {string[]} gitignoreRules - Array of gitignore rules to check against
 * @returns {boolean} True if the path should be ignored
 */
function shouldIgnore(
  filePath: string,
  gitignoreRules: string[] = [],
): boolean {
  if (gitignoreRules.length === 0) return false;

  // All the libraries for this kinda suck, but this mostly works. Note that
  // there might still be bugs in the gitignore logic.
  const gitignore = compileGitignore(gitignoreRules.join("\n"));
  return gitignore.denies(filePath);
}

export { getProjectItemType, shouldIgnore };
