export async function isDirectoryEmpty(path: string | URL): Promise<boolean> {
  // Iterate over the directory entries
  for await (const _entry of Deno.readDir(path)) {
    // If we find at least one entry, the directory is not empty
    return false;
  }
  // If no entries were found, the directory is empty
  return true;
}

export async function removeEmptyDirs(dir: string) {
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isDirectory) continue;

    const path = `${dir}/${entry.name}`;
    await removeEmptyDirs(path);

    try {
      await Deno.remove(path);
    } catch {
      // the errors are for deleting non empty dirs
    }
  }
}
