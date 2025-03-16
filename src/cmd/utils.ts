import Kia from "kia";
import { findVtRoot } from "~/vt/vt/utils.ts";

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
 * Attempts to find the VT root directory, or return false and updates spinner.
 *
 * @returns {Promise<string|false>} The VT root path if found, false otherwise
 */
export async function vtRootOrFalse(
  spinner?: Kia,
): Promise<string | false> {
  try {
    return await findVtRoot(Deno.cwd());
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      if (spinner) {
        spinner.fail("No .vt directory found in current path or any parent.");
      }
      return false;
    }
    throw e;
  }
}

/**
 * Get a spinner and make sure it stops before exiting.
 *
 * @param options - Spinner options or text string
 * @param callback - Function to execute with the spinner
 * @param config - Optional configuration
 * @param config.autostart - Whether to auto-start the spinner (defaults to true)
 */
export async function doWithSpinner(
  options: string,
  callback: (spinner: Kia) => Promise<unknown> | unknown,
  config?: { autostart?: boolean },
) {
  let spinner: Kia | undefined;
  try {
    spinner = new Kia(options);
    if (config?.autostart !== false) spinner.start();
    return await callback(spinner);
  } finally {
    if (spinner && spinner.isSpinning()) spinner.stop();
  }
}
