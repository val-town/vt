import { isDirectoryEmpty } from "~/utils.ts";

export function getActiveDir(givenDir: string): string {
  return givenDir || Deno.cwd();
}

/**
 * Validates and ensures a directory exists and is empty.
 * Creates the directory if it doesn't exist.
 *
 * @param rootPath - The full path to the directory to check/create
 * @throws Error if the path exists but is not a directory
 * @throws Error if the directory exists but is not empty
 */
export async function checkDirectory(rootPath: string) {
  try {
    const stat = await Deno.lstat(rootPath);

    if (!stat.isDirectory) {
      throw new Error(
        `Invalid destination, ${rootPath} exists but is not a directory`,
      );
    }
  } catch (error) {
    // If directory doesn't exist, create it
    if (error instanceof Deno.errors.NotFound) {
      await Deno.mkdir(rootPath, { recursive: true });
      return; // Directory is newly created so we know it's empty
    }
    throw error; // Re-throw any other errors
  }

  // Check if existing directory is empty
  if (!(await isDirectoryEmpty(rootPath))) {
    throw new Error(
      `Cannot proceed, ${rootPath} already exists and is not empty`,
    );
  }
}
