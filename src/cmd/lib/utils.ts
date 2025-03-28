import { colors } from "@cliffy/ansi/colors";
import { type ProjectItemType, STATUS_STYLES } from "~/consts.ts";
import type { FileState } from "~/vt/lib/FileState.ts";

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

/**
 * Formats a file path with a colored status prefix for display.
 *
 * @param path - The file path to format
 * @param status - The status of the file (e.g., 'modified', 'deleted')
 * @param type - The type of the file object (e.g., 'script', 'http', 'file')
 * @param maxTypeLength - The maximum present file type object literal length (script=6)
 * @returns A formatted string with colored status prefix, file type, and path
 *
 * @example
 * // Returns something like "✓ (js   ) src/index.js" with appropriate colors
 * formatStatus('src/index.js', 'success', 'js', 5);
 */
export function formatStatus(
  path: string,
  status: keyof FileState,
  type?: ProjectItemType,
  maxTypeLength: number = 0,
): string {
  // Get color configuration for the status or use default
  const config = STATUS_STYLES[status];

  // Get the base status text
  const baseStatusText = config.color(config.prefix) + " ";

  // If type is empty or undefined, don't include type indicator
  if (!type) {
    return baseStatusText + path;
  }

  // Extract file type with consistent padding
  const paddedFileType = type.padEnd(maxTypeLength);

  // Create formatted type indicator with colors
  const typeStart = colors.gray("(");
  const typeContent = colors.dim(paddedFileType);
  const typeEnd = colors.gray(")");
  const typeIndicator = typeStart + typeContent + typeEnd;

  // Combine the status prefix, type indicator, and path
  return baseStatusText + typeIndicator + " " + path;
}

/**
 * Displays file changes and summary information from a FileStateChanges
 *
 * @param fileStateChanges - The file state changes, containing modified, created, and deleted files
 * @param options - Display options
 * @param options.headerText - Custom header text to display before file changes
 * @param [options.summaryText="Summary:"] - Text to show before the summary
 * @param options.emptyMessage - Message to show when there are no changes
 * @param [options.showEmpty=true] - Whether to show output when there are no changes
 * @param [options.includeSummary=true] - Whether to display the summary
 * @param [options.includeTypes=true] - Whether to display the (detected) types of the files
 * @returns void
 */
export function displayFileStateChanges(
  fileStateChanges: FileState,
  options: {
    headerText: string;
    summaryText?: string;
    emptyMessage?: string;
    showEmpty?: boolean;
    includeSummary?: boolean;
    includeTypes?: boolean;
  },
): void {
  const {
    headerText: headerText,
    summaryText: summaryPrefix = "Summary:",
    emptyMessage,
    showEmpty = true,
    includeSummary = true,
    includeTypes = true,
  } = options;
  const totalChanges = fileStateChanges.changes();

  // Exit early if we do not show empty
  if (totalChanges === 0 && !showEmpty) return;

  // Display header if provided
  if (headerText && totalChanges !== 0) console.log(headerText);

  // Calculate the longest type length from all files
  const maxTypeLength = fileStateChanges.entries()
    .filter(([type]) => type !== "not_modified")
    .flatMap(([_, files]) => files)
    .reduce((max, file) => Math.max(max, file.type.length), 0);

  // Print all changed files state
  for (const [type, files] of fileStateChanges.entries()) {
    if (type !== "not_modified") {
      for (const file of files) {
        console.log(
          "  " +
            formatStatus(
              file.path,
              file.status,
              includeTypes ? file.type : undefined,
              maxTypeLength,
            ),
        );
      }
    }
  }

  // Provide a summary if requested
  if (includeSummary) {
    if (totalChanges === 0) {
      console.log(colors.green(emptyMessage));
    } else {
      console.log("\n" + summaryPrefix);
      for (const [type, files] of fileStateChanges.entries()) {
        if (type !== "not_modified" && files.length > 0) {
          const typeColor = STATUS_STYLES[type as keyof FileState];
          const coloredType = typeColor.color(type);
          console.log("  " + files.length + " " + coloredType);
        }
      }
    }
  }
}

export const noChangesDryRunMsg = "Dry run completed. " +
  colors.underline("No changes were made.");
