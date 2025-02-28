/**
 * Checks if a directory is empty.
 *
 * @param {string} path - The path to the directory you want to check.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the directory is empty, `false` otherwise.
 */
export async function isDirectoryEmpty(path: string | URL): Promise<boolean> {
  // Iterate over the directory entries
  for await (const _entry of Deno.readDir(path)) {
    // If we find at least one entry, the directory is not empty
    return false;
  }
  // If no entries were found, the directory is empty
  return true;
}
