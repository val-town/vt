import { colors } from "@cliffy/ansi/colors";
import { basename, dirname, join } from "@std/path";
import { ProjectItemColors, STATUS_STYLES, TypeToTypeStr } from "~/consts.ts";
import type {
  ItemStatus,
  ItemStatusManager,
} from "~/vt/lib/ItemStatusManager.ts";
import type { ProjectItemType } from "~/types.ts";

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
  // If there's only one version (first and latest are the same)
  if (firstVersion === latestVersion) {
    return colors.cyan(currentVersion.toString());
  }

  // If current version is the latest, show the range from first to current
  if (currentVersion === latestVersion) {
    return `${firstVersion}..${colors.cyan(currentVersion.toString())}`;
  }

  // If current version is the first, show the range from current to latest
  if (currentVersion === firstVersion) {
    return `${colors.cyan(currentVersion.toString())}..${latestVersion}`;
  }

  // Otherwise, show the full range: first..current..latest
  return `${firstVersion}..${
    colors.cyan(currentVersion.toString())
  }..${latestVersion}`;
}

/**
 * Formats a file path with a colored status prefix for display.
 *
 * @param path - The file path to format
 * @param status - The status of the file (e.g., 'modified', 'deleted')
 * @param type - The type of the file object (e.g., 'script', 'http', 'file')
 * @param maxTypeLength - The maximum present file type object literal length (script=6)
 * @returns A formatted string with colored status prefix, file type, and path
 */
export function formatStatus(
  file: ItemStatus,
  type?: ProjectItemType,
  maxTypeLength: number = 0,
): string {
  const styleConfig = STATUS_STYLES[file.status];

  // Handle renamed files differently
  let pathDisplay;
  if (file.status === "renamed") {
    // For renamed files, show oldPath -> path
    pathDisplay = //
      join(
        dirname(file.oldPath),
        styleConfig.color(basename(file.oldPath)),
      ) +
      colors.dim(" -> ") + join(
        dirname(file.path),
        styleConfig.color(basename(file.path)),
      ) +
      ` ${colors.gray((file.similarity * 100).toFixed(2) + "%")}`;
  } else {
    // Normal path display for other statuses
    pathDisplay = join(
      dirname(file.path),
      styleConfig.color(basename(file.path)),
    );
  }

  // Construct the final formatted string
  if (type !== undefined) {
    // Format type indicator with consistent padding and colors
    // Use padEnd on the original string before applying colors
    const typeStr = TypeToTypeStr[type];
    const paddedTypeStr = typeStr.padEnd(maxTypeLength);
    const typeIndicator = colors.gray("(") +
      ProjectItemColors[type](paddedTypeStr) +
      colors.gray(")");

    return `${
      styleConfig.color(styleConfig.prefix)
    } ${typeIndicator} ${pathDisplay}`;
  } else {
    // No type provided, don't include type indicator
    return `${styleConfig.color(styleConfig.prefix)} ${pathDisplay}`;
  }
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
  fileStateChanges: ItemStatusManager,
  options: {
    headerText: string;
    summaryText?: string;
    emptyMessage?: string;
    showEmpty?: boolean;
    includeSummary?: boolean;
    includeTypes?: boolean;
  },
): string {
  const {
    headerText: headerText,
    summaryText: summaryPrefix = "Summary:",
    emptyMessage,
    showEmpty = true,
    includeSummary = true,
    includeTypes = true,
  } = options;
  const output: string[] = [];
  const totalChanges = fileStateChanges.changes();
  const fileStateChangesEntriesSorted = fileStateChanges
    .entries({ sorted: true });

  // Exit early if we do not show empty
  if (totalChanges === 0 && !showEmpty) return "";

  // Display header if provided
  if (headerText && totalChanges !== 0) output.push(headerText);

  // Calculate the longest type length from all files
  const maxTypeLength = fileStateChangesEntriesSorted
    .filter(([type]) => type !== "not_modified")
    .flatMap(([_, files]) => files)
    .reduce((max, file) => {
      // Get the actual string representation that will be displayed
      const typeStr = TypeToTypeStr[file.type];
      return Math.max(max, typeStr.length);
    }, 0);

  // Print all changed files state
  for (const [type, files] of fileStateChangesEntriesSorted) {
    if (type !== "not_modified") {
      for (const file of files) {
        output.push(
          "  " +
            formatStatus(
              file,
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
      if (emptyMessage) {
        output.push(colors.green(emptyMessage));
      }
    } else {
      output.push("\n" + summaryPrefix);
      for (const [type, files] of fileStateChangesEntriesSorted) {
        if (type !== "not_modified" && files.length > 0) {
          const typeColor = STATUS_STYLES[type as keyof ItemStatusManager];
          const coloredType = typeColor.color(type);
          output.push("  " + files.length + " " + coloredType);
        }
      }
    }
  }

  return output.join("\n");
}

export const noChangesDryRunMsg = "Dry run completed. " +
  colors.underline("No changes were made.");
