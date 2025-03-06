import * as path from "@std/path";
import { VAL_TYPE_EXTENSIONS } from "~/consts.ts";

/**
 * Adds val file extension to a path or filename
 *
 * @param filepath Path or filename
 * @param type Val file type (script, http, ...)
 * @param abbreviated Whether to use val file extension (default: false)
 * @returns Path or filename with val file extension
 */
function withValExtension(
  filepath: string,
  type: keyof typeof VAL_TYPE_EXTENSIONS,
  abbreviated: boolean = false,
): string {
  const extension = abbreviated
    ? `.${VAL_TYPE_EXTENSIONS[type].abbreviated}.tsx`
    : `.${VAL_TYPE_EXTENSIONS[type].standard}.tsx`;

  const dirname = path.dirname(filepath);
  const basename = path.basename(filepath);
  const baseFilename = withoutValExtension(basename, abbreviated);
  
  return path.join(dirname, baseFilename + extension);
}

/**
 * Removes val file extension from a path or filename if present
 * @param filepath Path or filename with possible val file extension
 * @param abbreviated Whether to check for val file extension (default: false)
 * @returns Path or filename without val file extension
 */
function withoutValExtension(
  filepath: string,
  abbreviated: boolean = false,
): string {
  const dirname = path.dirname(filepath);
  const basename = path.basename(filepath);
  
  const extensions = Object.values(VAL_TYPE_EXTENSIONS).map(
    (ext) => abbreviated ? `.${ext.abbreviated}.tsx` : `.${ext.standard}.tsx`,
  );

  for (const extension of extensions) {
    if (basename.endsWith(extension)) {
      return path.join(dirname, basename.slice(0, -extension.length));
    }
  }
  return filepath;
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
