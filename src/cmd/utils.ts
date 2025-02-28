/**
 * Gets active directory path, either from the provided directory or the
 * current working directory.
 *
 * @param givenDir - The directory path provided by the user (optional)
 * @returns The active directory path - either the provided path or current working directory
 */
export function getActiveDir(givenDir: string): string {
  return givenDir || Deno.cwd();
}
