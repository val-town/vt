import ValTown from "@valtown/sdk";
import Kia from "kia";
import { sentenceCase } from "~/utils.ts";

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
  let status = 0;
  try {
    spinner = new Kia(spinnerText);
    if (options?.autostart !== false) spinner.start();
    return await callback(spinner);
  } catch (e) {
    console.log(e);
    if (e instanceof ValTown.APIError) {
      spinner?.fail(sentenceCase(e.message.replace(/^\d+\s+/, "")));
    } else if (e instanceof Error) spinner?.fail(e.message);
    status = 1;
  } finally {
    if (spinner && spinner.isSpinning()) spinner.stop();
    Deno.exit(status);
  }
}
