import {
  DEFAULT_VAL_TYPE,
  FIRST_VERSION_NUMBER,
  RECENT_VERSION_COUNT,
} from "~/consts.ts";
import { compile as compileGitignore } from "gitignore-parser";
import type { ValItemType } from "~/types.ts";
import { getValItem } from "~/utils/mod.ts";

/**
 * Determine the type of a Val file.
 *
 * This function attempts to determine the type of a file within a val
 * based on its existing state on the server or its filename. The process...
 * 1. Check if the file already exists in the Val at the specified path.
 *    Check at the current version, or at a few versions back, in case the file
 *    was deleted but then recreated, so we preserve the type.
 * 2. If the file does not exist, determine its type based on its file extension:
 *    - Files ending in .ts, .tsx, .js, or .jsx are considered "val" files.
 *    - Check the filename for keywords like "cron", "http", or "email" to
 *      determine specific types:
 *      - If multiple keywords are found, default to "script".
 *      - Otherwise, return "interval" for "cron", "http" for "http", etc
 *      - Default to "script" if no keywords are found.
 * 3. If the file does not match the Val extension criteria (.ts + optional
 *    identifier), return "file".
 *
 * @param valId - The ID of the project
 * @param options - Options for determining the file type
 * @param options.branchId - The ID of the branch
 * @param [options.version] - The version of the val (optional, defaults to latest)
 * @param options.filePath - The path of the val or file to get the type of
 * @returns The val file type
 */
export async function getValItemType(
  valId: string,
  branchId: string,
  version: number,
  filePath: string,
): Promise<ValItemType> {
  // Preserve the type if the file was deleted recently and then recreated
  for (
    let i = version || FIRST_VERSION_NUMBER;
    i > (version || FIRST_VERSION_NUMBER) - RECENT_VERSION_COUNT;
    i--
  ) {
    const type = await getValItem(valId, branchId, version, filePath)
      .then((resp) => resp?.type);

    if (type === undefined) continue;
    else return type;
  }

  // Otherwise, if it ends in .ts, .js, .tsx, or .jsx, it is a val
  if (/\.(ts|tsx|js|jsx)$/.test(filePath)) {
    const isCron = filePath.includes("cron");
    const isHttp = filePath.includes("http");
    const isEmail = filePath.includes("email");

    // If it's ambiguous then it is a script Val by default
    if ([isCron, isHttp, isEmail].filter(Boolean).length > 1) {
      return DEFAULT_VAL_TYPE;
    }

    // But otherwise look at the file name and try to figure out what type
    // of Val it is based on whether the file name contains a pattern like
    // "cron," etc
    if (isCron) return "interval";
    if (isHttp) return "http";
    if (isEmail) return "email";

    // If we can't figure it out, default to script
    return DEFAULT_VAL_TYPE;
  }

  // Otherwise, it's just a plain old file val
  return "file";
}

/**
 * Checks if a path should be ignored based on gitignore rules.
 *
 * If rootDir is provided, and the path is a directory, then it checks if all
 * paths downward are ignored.
 *
 * @param pathToCheck - Path to check
 * @param gitignoreRules - Array of gitignore rules to check against
 * @returns True if the path should be ignored
 */
export function shouldIgnore(
  pathToCheck: string,
  gitignoreRules: string[] = [],
): boolean {
  if (gitignoreRules.length === 0) return false;

  // All the libraries for this kinda suck, but this mostly works. Note that
  // there might still be bugs in the gitignore logic.
  const gitignore = compileGitignore(gitignoreRules.join("\n"));
  return gitignore.denies(pathToCheck);
}
