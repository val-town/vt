import * as path from "@std/path";
import { VAL_TYPE_EXTENSIONS } from "~/consts.ts";

/**
 * Adds val file extension to a filename
 *
 * @param filename - Base filename
 * @param type - Val file type (script, http, ...)
 * @param [abbreviated] - Whether to use val file extension (default: false)
 * @returns Filename with val file extension
 */
function withValExtension(
  filename: string,
  type: keyof typeof VAL_TYPE_EXTENSIONS,
  abbreviated: boolean = false,
): string {
  const extension = abbreviated
    ? `.${VAL_TYPE_EXTENSIONS[type].abbreviated}.tsx`
    : `.${VAL_TYPE_EXTENSIONS[type].standard}.tsx`;

  const baseFilename = withoutValExtension(filename);

  return baseFilename + extension;
}

/**
 * Removes val file extension from a filename if present
 * @param filename Filename with possible val file extension
 * @param abbreviated Whether to check for val file extension (default: false)
 * @returns Filename without val file extension
 */
function withoutValExtension(
  filename: string,
  abbreviated: boolean = false,
): string {
  const extensions = Object.values(VAL_TYPE_EXTENSIONS).map(
    (ext) => abbreviated ? `.${ext.abbreviated}.tsx` : `.${ext.standard}.tsx`,
  );

  for (const extension of extensions) {
    if (filename.endsWith(extension)) {
      return filename.slice(0, -extension.length);
    }
  }
  return filename;
}

/**
 * Creates RegExp patterns from glob patterns for ignoring files.
 *
 * @param {string[]} ignoreGlobs Array of glob patterns to convert
 * @returns {RegExp[]} Array of RegExp patterns
 */
function createIgnorePatterns(ignoreGlobs: string[]): RegExp[] {
  return ignoreGlobs.map((glob) =>
    path.globToRegExp(glob, { extended: true, globstar: true })
  );
}

/**
 * Checks if a path should be ignored based on ignore patterns.
 *
 * @param {string} filePath Path to check
 * @param {string[]} ignoreGlobs Array of glob patterns to check against
 * @returns {boolean} True if the path should be ignored
 */
function shouldIgnoreGlob(
  filePath: string,
  ignoreGlobs: string[] = [],
): boolean {
  return createIgnorePatterns(ignoreGlobs).some((pattern) =>
    pattern.test(filePath)
  );
}

export { shouldIgnoreGlob, withoutValExtension, withValExtension };
