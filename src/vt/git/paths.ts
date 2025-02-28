export const VAL_TYPE_EXTENSIONS: Record<
  string,
  { abbreviated: string; standard: string }
> = {
  "script": { abbreviated: "S", standard: "script" },
  "http": { abbreviated: "H", standard: "http" },
  "email": { abbreviated: "E", standard: "email" },
  "interval": { abbreviated: "C", standard: "interval" },
};

type ValType = keyof typeof VAL_TYPE_EXTENSIONS;

/**
 * Adds val file extension to a filename
 *
 * @param filename Base filename
 * @param type Val file type (script, http, ...)
 * @param abbreviated Whether to use val file extension (default: false)
 * @returns Filename with val file extension
 */
export function withValExtension(
  filename: string,
  type: ValType,
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
export function withoutValExtension(
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
