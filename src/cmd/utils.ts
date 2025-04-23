import ValTown from "@valtown/sdk";
import { join } from "@std/path";
import Kia from "kia";

/**
 * Determines the clone path based on the provided directory and val name
 *
 * @param specifiedTarget Optional directory where the val should be cloned
 * @param valName Name of the val being cloned
 * @returns The absolute path where the val will be cloned
 */
export function getClonePath(
  specifiedTarget: string | undefined,
  valName: string,
): string {
  return specifiedTarget || join(Deno.cwd(), valName);
}

/**
 * Clean and transform error messages
 *
 * @param error - The error to be processed
 * @returns A cleaned error message
 */
export function sanitizeErrors(error: unknown): string {
  if (error instanceof ValTown.APIError) {
    // Remove leading numbers from error message and convert to sentence case
    const cleanedMessage = error.message.replace(/^\d+\s+/, "");
    return cleanedMessage.charAt(0).toUpperCase() + cleanedMessage.slice(1);
  }

  if (error instanceof Error) {
    return error.message;
  }

  // For any other type of error, convert to string
  return String(error);
}

/**
 * Execute a function with a spinner, ensuring it stops after execution.
 *
 * @param spinnerText - Initial spinner text
 * @param callback - Function to execute with the spinner
 * @param options - Optional configuration for spinner behavior
 * @param options.autostart - Whether to start the spinner automatically (default: true)
 * @param options.cleanError - Function to clean error messages (default: sanitizeErrors)
 * @param options.exitOnError - Whether to exit on error (default: true)
 * @returns The result of the callback function
 */
export async function doWithSpinner<T>(
  spinnerText: string,
  callback: (spinner: Kia) => Promise<T>,
  options: {
    autostart?: boolean;
    cleanError?: (error: unknown) => string;
    exitOnError?: boolean;
  } = {},
): Promise<T> {
  const {
    autostart = true,
    cleanError = sanitizeErrors,
    exitOnError = true,
  } = options;

  let spinner: Kia | undefined;

  try {
    spinner = new Kia(spinnerText);

    if (autostart) spinner.start();

    return await callback(spinner);
  } catch (e) {
    // Use the provided or default error cleaning function
    const cleanedErrorMessage = cleanError(e);

    // Fail the spinner with the cleaned error message
    spinner?.fail(cleanedErrorMessage);

    if (exitOnError) Deno.exit(1);

    // This throw is necessary for TypeScript to understand the control flow
    // It will only be reached if exitOnError is false
    throw e;
  } finally {
    // Ensure spinner is stopped in all scenarios
    if (spinner?.isSpinning()) {
      spinner.stop();
    }
  }
}
