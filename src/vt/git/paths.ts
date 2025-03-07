import * as path from "@std/path";
import { VAL_TYPE_EXTENSIONS } from "~/consts.ts";

type ProjectItemType = "script" | "http" | "email" | "interval" | "file";

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
 * Retrieves the val file type based on its extension using regex and a map.
 *
 * @param filepath Path or filename to analyze
 * @param abbreviated Whether to check for abbreviated val file extensions (default: false)
 * @returns The val file type
 * @throws Error if no matching type is found
 */
export function getValType(
  filepath: string,
  abbreviated: boolean = false,
): ProjectItemType {
  const basename = path.basename(filepath);

  // Create a map of extensions to val types using functional programming
  const extensionToTypeMap = Object.entries(VAL_TYPE_EXTENSIONS).reduce(
    (map, [valType, ext]) => {
      const extensionKey = abbreviated ? ext.abbreviated : ext.standard;
      map.set(extensionKey, valType as ProjectItemType);
      return map;
    },
    new Map<string, keyof typeof VAL_TYPE_EXTENSIONS>(),
  );

  // Regex pattern to extract the extension right before .tsx
  const regexPattern = /\.([^\.]+)\.tsx$/;
  const match = basename.match(regexPattern);

  if (match) {
    const extensionKey = match[1];
    const valType = extensionToTypeMap.get(extensionKey);
    if (valType) {
      return valType as ProjectItemType;
    }
  }

  return "file";
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
