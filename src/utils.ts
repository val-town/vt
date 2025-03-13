import { basename, globToRegExp } from "jsr:@std/path@^1.0.8";


export async function isDirectoryEmpty(
  path: string | URL,
  ignoreGlobs: string[] = [],
): Promise<boolean> {
  const ignorePatterns = ignoreGlobs.map((glob) => globToRegExp(glob));

  for await (const entry of Deno.readDir(path)) {
    // Check if entry matches any ignore pattern
    const shouldIgnore = ignorePatterns.some((pattern) =>
      pattern.test(entry.name)
    );
    if (!shouldIgnore) {
      return false;
    }
  }
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

/**
 * Validates and ensures a directory exists and is empty.
 * Creates the directory if it doesn't exist.
 *
 * @param rootPath - The full path to the directory to check/create
 * @param options - Configuration options
 * @param options.ignoreGlobs - Glob patterns to ignore when checking if directory is empty
 * @throws Error if the path exists but is not a directory
 * @throws Error if the directory exists but is not empty
 */
export async function checkDirectory(
  rootPath: string,
  options: { ignoreGlobs?: string[] } = {},
) {
  const { ignoreGlobs = [] } = options;

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

  // Check if existing directory is empty (considering ignored patterns)
  if (!(await isDirectoryEmpty(rootPath, ignoreGlobs))) {
    throw new Error(
      `Cannot proceed, ./${basename(rootPath)} already exists and is not empty`,
    );
  }
}
