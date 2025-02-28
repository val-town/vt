export const VAL_TYPE_EXTENSIONS: Record<string, string> = {
  "script": ".S.tsx",
  "http": ".H.tsx",
  "email": ".E.tsx",
  "interval": ".C.tsx",
};

type ValType = keyof typeof VAL_TYPE_EXTENSIONS;

/**
 * Adds validation type extension to a filename
 * @param filename Base filename
 * @param type Validation type (script, http, email, interval)
 * @returns Filename with validation extension
 */
export function withValExtension(filename: string, type: ValType): string {
  // Remove any existing val extension first
  const baseFilename = withoutValExtension(filename);
  return baseFilename + VAL_TYPE_EXTENSIONS[type];
}

/**
 * Removes validation type extension from a filename if present
 * @param filename Filename with possible validation extension
 * @returns Filename without validation extension
 */
export function withoutValExtension(filename: string): string {
  for (const extension of Object.values(VAL_TYPE_EXTENSIONS)) {
    if (filename.endsWith(extension)) {
      return filename.slice(0, -extension.length);
    }
  }
  return filename;
}
