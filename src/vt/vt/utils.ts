import { join } from "@std/path";
import { MAX_WALK_UP_LEVELS } from "~/consts.ts";
import { findRoot } from "../../utils/misc.ts";

/**
 * Finds the nearest directory containing a .vt folder by climbing up the directory tree
 *
 * @param startPath The path to start searching from
 * @param maxLevels The maximum number of levels to walk up (default is MAX_WALK_UP_LEVELS)
 * @throw If no .vt directory is found within the specified levels
 * @returns The path to the directory containing a .vt folder
 */
export async function findVtRoot(
  startPath: string,
  maxLevels: number = MAX_WALK_UP_LEVELS,
): Promise<string> {
  try {
    return await findRoot(
      startPath,
      // the isRoot() callback
      async (path: string): Promise<boolean> => {
        const vtDirPath = join(path, ".vt"); // it's a root if there's a .vt dir
        const stat = await Deno.stat(vtDirPath);
        return stat.isDirectory;
      },
      maxLevels,
    );
  } catch (e) {
    if (e instanceof Error && e.message.includes("found")) {
      throw new Error(`No .vt directory found in current directory or higher.`);
    } else throw e;
  }
}
