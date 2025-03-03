import type VTClient from "~/vt/vt/VTClient.ts";

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

/**
 * Checks if the working directory has uncommitted changes and throws an error if it does.
 *
 * @param {VTClient} vt - The VTClient instance to check
 * @param {string} cwd - The current working directory to check for changes
 * @param {string} operation - The name of the operation being performed (for error message)
 * @returns {Promise<boolean>} Returns true if the directory is clean
 * @throws {Error} Throws an error if there are uncommitted changes
 */
export async function checkDirtyState(
  vt: VTClient,
  cwd: string,
  operation: string,
): Promise<boolean> {
  if (await vt.isDirty(cwd)) {
    throw new Error(
      `Cannot ${operation} with uncommitted changes. Please commit or stash your changes first.`,
    );
  }
  return true;
}
