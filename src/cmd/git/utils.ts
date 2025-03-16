import { colors } from "@cliffy/ansi/colors";
import { ProjectItems, STATUS_COLORS } from "~/consts.ts";
import { getTotalChanges } from "~/vt/git/utils.ts";
import { StatusResult } from "~/vt/git/status.ts";
import Kia from "kia";
import { findVtRoot } from "~/vt/vt/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { doWithSpinner } from "~/cmd/utils.ts";

/**
 * Generates an error message for commands that cannot be executed with unpushed changes
 *
 * @param command - The command that was attempted to be executed
 * @param forceFlag - The flag to force execution despite local changes, defaults to "-f"
 * @returns A formatted error message string indicating how to bypass the restriction
 */
export function dirtyErrorMsg(command: string, forceFlag: string = "-f") {
  return `Cannot ${command} with unpushed changes, use \`${command} ${forceFlag}\` to ignore local changes`;
}

/**
 * Formats a version range string based on the first, current, and latest versions.
 *
 * The function returns:
 * - Only the current version (in green) if it equals the latest version
 * - A range string "firstVersion..currentVersion..latestVersion" with currentVersion in green
 *   if the current version is less than the latest version
 *
 * @param firstVersion - The initial version number in the range
 * @param currentVersion - The currently used version number (will be highlighted in green)
 * @param latestVersion - The latest available version number
 * @returns A formatted version range string
 */
export function getVersionRangeStr(
  firstVersion: number,
  currentVersion: number,
  latestVersion: number,
): string {
  // If current version is the latest, only return the current version in green
  if (currentVersion === latestVersion) {
    return colors.cyan(currentVersion.toString());
  }

  // Otherwise, return the full range
  const versions = [firstVersion.toString(), currentVersion.toString()];
  if (latestVersion && currentVersion !== latestVersion) {
    versions.push(latestVersion.toString());
  }

  const formattedVersions = versions
    .map((v) => v === currentVersion.toString() ? colors.cyan(v) : v);

  return formattedVersions.join("..");
}

// Formats a file path with a colored status prefix for display.
export function formatStatus(
  path: string,
  status: string,
  type: string,
): string {
  // Get color configuration for the status or use default
  const config = STATUS_COLORS[status] || { prefix: " ", color: colors.gray };

  // Extract file type with consistent padding
  const paddedFileType = type.padEnd(ProjectItems.length);

  // Create formatted type indicator with colors
  const typeStart = colors.gray("(");
  const typeContent = colors.dim(paddedFileType);
  const typeEnd = colors.gray(")");
  const typeIndicator = typeStart + typeContent + typeEnd;

  // Get the base status text
  const baseStatusText = config.color(config.prefix) + " ";

  // Combine the status prefix, type indicator, and path
  return baseStatusText + typeIndicator + " " + path;
}

/**
 * Displays file changes and summary information from a status result.
 *
 * @param status - The status result containing modified, created, and deleted files
 * @param options - Display options
 * @param options.showEmpty - Whether to show output when there are no changes (default: true)
 * @param options.headerText - Custom header text to display before file changes (optional)
 * @param options.summaryPrefix - Text to show before the summary (default: "Changes:")
 * @param options.emptyMessage - Message to show when there are no changes (default: "No changes")
 * @param options.includeSummary - Whether to display the summary (default: true)
 * @returns The total number of changes
 */
export function displayStatusChanges(
  status: StatusResult,
  options: {
    showEmpty?: boolean;
    headerText?: string;
    summaryPrefix?: string;
    emptyMessage?: string;
    includeSummary?: boolean;
  } = {},
): void {
  const {
    showEmpty = true,
    headerText,
    summaryPrefix = "Changes:",
    emptyMessage = "No changes. Working tree clean.",
    includeSummary = true,
  } = options;

  const totalChanges = getTotalChanges(status);

  // Exit early if we do not show empty
  if (totalChanges === 0 && !showEmpty) return;

  // Display header if provided
  if (headerText) console.log(headerText);

  // Print all changed files state
  for (const [type, files] of Object.entries(status)) {
    if (type !== "not_modified") {
      for (const file of files) {
        console.log(formatStatus(file.path, file.status, file.type));
      }
    }
  }

  // Provide a summary if requested
  if (includeSummary) {
    if (totalChanges === 0) {
      console.log(colors.green(emptyMessage));
    } else {
      console.log("\n" + summaryPrefix);
      for (const [type, files] of Object.entries(status)) {
        if (type !== "not_modified" && files.length > 0) {
          const typeConfig = STATUS_COLORS[type] || { color: colors.gray };
          const coloredType = typeConfig.color(type);
          console.log("  " + files.length + " " + coloredType);
        }
      }
    }
  }
}

/**
 * Execute an action with both a spinner and VT client.
 *
 * @param spinnerText - Text to display in the spinner
 * @param callback - Function to execute with both spinner and VT client
 * @param options - Optional configuration
 * @param options.spinnerAutostart - Whether to auto-start the spinner (defaults to true)
 */
export async function doVtAction(
  spinnerText: string,
  callback: (context: { spinner: Kia; vt: VTClient }) => Promise<void> | void,
): Promise<void> {
  await doWithSpinner(spinnerText, async (spinner) => {
    try {
      // Find VT root directory
      const vtRoot = await findVtRoot(Deno.cwd());

      // Initialize VT client
      const vt = VTClient.from(vtRoot);

      // Execute callback with both spinner and VT client
      await callback({ spinner, vt });
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        spinner.fail("No .vt directory found in current path or any parent.");
        return;
      }
      throw e;
    }
  });
}
