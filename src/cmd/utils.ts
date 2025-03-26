import ValTown from "@valtown/sdk";
import Kia from "kia";

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
 * @returns The result of the callback function
 */
export async function doWithSpinner<T>(
  spinnerText: string,
  callback: (spinner: Kia) => Promise<T> | T,
  options: {
    autostart?: boolean;
    cleanError?: (error: unknown) => string;
  } = {},
): Promise<T> {
  const {
    autostart = true,
    cleanError = sanitizeErrors,
  } = options;

  let spinner: Kia | undefined;

  try {
    spinner = new Kia(spinnerText);

    if (autostart) {
      spinner.start();
    }

    const result = await callback(spinner);

    // Optionally stop the spinner on successful completion
    spinner.succeed("Operation completed");

    return result;
  } catch (error) {
    // Use the provided or default error cleaning function
    const cleanedErrorMessage = cleanError(error);

    // Fail the spinner with the cleaned error message
    spinner?.fail(cleanedErrorMessage);

    // Re-throw the original error
    throw error;
  } finally {
    // Ensure spinner is stopped in all scenarios
    if (spinner?.isSpinning()) {
      spinner.stop();
    }
  }
}
