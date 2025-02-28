export async function isDirectoryEmpty(path: string | URL): Promise<boolean> {
  // Iterate over the directory entries
  for await (const _entry of Deno.readDir(path)) {
    // If we find at least one entry, the directory is not empty
    return false;
  }
  // If no entries were found, the directory is empty
  return true;
}
