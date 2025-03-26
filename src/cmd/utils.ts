import Kia from "kia";

/**
 * Execute a function with a spinner, providing progress feedback.
 *
 * @param spinnerText - Initial text to display on the spinner
 * @param callback - Function to execute with spinner controls
 * @param options - Optional configuration for spinner behavior
 * @returns The result of the callback function
 */
export async function doWithSpinner<T>(
  spinnerText: string,
  callback: (context: {
    spinner: Kia;
    error: (msg: string, status?: number) => void;
    succeed: (msg: string) => void;
  }) => Promise<T> | T,
  options: { autostart?: boolean } = {},
): Promise<T> {
  const { autostart = true } = options;
  let spinner: Kia | undefined;

  try {
    spinner = new Kia(spinnerText);

    if (autostart) {
      spinner.start();
    }

    const error = (msg: string, statusCode = 1) => {
      spinner?.fail(msg);
      Deno.exit(statusCode);
    };

    const succeed = (msg: string) => {
      spinner?.succeed(msg);
    };

    return await callback({ spinner, error, succeed });
  } finally {
    if (spinner?.isSpinning()) spinner.stop();
  }
}
