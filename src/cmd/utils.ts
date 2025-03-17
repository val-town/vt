import Kia from "kia";
import { findVtRoot } from "~/vt/vt/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";

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
 * Get a spinner and make sure it stops before exiting.
 *
 * @param spinnerText - Initial spinner text
 * @param callback - Function to execute with the spinner
 * @param options - Optional configuration
 * @param options.autostart - Whether to auto-start the spinner (defaults to true)
 */
export async function doWithSpinner(
  spinnerText: string,
  callback: (spinner: Kia) => Promise<unknown> | unknown,
  options?: { autostart?: boolean },
) {
  let spinner: Kia | undefined;
  try {
    spinner = new Kia(spinnerText);
    if (options?.autostart !== false) spinner.start();
    return await callback(spinner);
  } catch (e) {
    if (e instanceof Error) spinner?.fail(e.message);
  } finally {
    if (spinner && spinner.isSpinning()) spinner.stop();
  }
}

/**
 * Initialize a VT client and execute a callback with it.
 * Throws Deno.errors.NotFound if no .vt directory is found.
 *
 * @param callback - Function to execute with the VT client
 * @returns The result from the callback
 */
export async function doWithVtClient<T>(
  callback: (vt: VTClient) => Promise<T> | T,
): Promise<T> {
  // Find VT root directory - will throw Deno.errors.NotFound if not found
  const vtRoot = await findVtRoot(Deno.cwd());

  // Initialize VT client
  const vt = VTClient.from(vtRoot);

  // Execute callback with VT client
  return await callback(vt);
}
