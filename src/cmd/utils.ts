import ValTown from "@valtown/sdk";
import { join } from "@std/path";
import Kia from "kia";
import { colors } from "@cliffy/ansi/colors";
import { toListBranchesCmdMsg } from "~/cmd/lib/utils/messages.ts";

/**
 * Determines the clone path based on the provided directory and Val name
 *
 * @param specifiedTarget Optional directory where the Val should be cloned
 * @param valName Name of the Val being cloned
 * @returns The absolute path where the Val will be cloned
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
 * @param error The error to be processed
 * @returns A cleaned error message
 */
export function sanitizeErrors(error: unknown): string {
  if (error instanceof ValTown.APIError) {
    let suffixedExtra = "";

    if (error.status === 404) {
      if (error.message.toLowerCase().includes("branch")) {
        suffixedExtra = "You may have deleted the current branch. " +
          "To recover, check out a branch that still exists. " +
          toListBranchesCmdMsg;
      }
      if (error.message.toLowerCase().includes("project")) {
        suffixedExtra = "You may have deleted the current Val. " +
          "This folder is no longer usable with `vt`. " +
          "If you have important files, create a new Val and copy them over.";
      }
    } else if (error.status === 401) {
      suffixedExtra =
        "You may need to re-authenticate. To set a new API key, use `vt config set apiKey new_api_key`";
    }

    if (error.message.includes("required permissions")) {
      suffixedExtra +=
        "To set a new API key, use `vt config set apiKey new_api_key`";
    }

    // Remove leading numbers from error message
    const cleanedMessage = error.message
      .replace(/^\d+\s+/, "")
      .replace(/[pP]roject/, "Val");
    const message = colors.red(
      cleanedMessage.charAt(0).toUpperCase() + cleanedMessage.slice(1) +
        (suffixedExtra.length > 0 ? ".\n" : "."),
    ) + colors.yellow(suffixedExtra);
    return message;
  }

  if (error instanceof Error) return error.message;

  // For any other type of error, convert to string
  return String(error);
}

/**
 * Execute a function with a spinner, ensuring it stops after execution.
 *
 * @template T The return type of the callback function
 * @param spinnerText - Initial spinner text
 * @param callback - Function to execute with the spinner
 * @param Optional configuration for spinner behavior
 * @param options.autostart Whether to start the spinner automatically
 * @param Function to clean error messages
 * @param options.exitOnError Whether to exit on error
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
