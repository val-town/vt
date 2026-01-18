import { colors } from "@cliffy/ansi/colors";
import {
  STATUS_STYLES,
  TypeToTypeStr,
  ValItemColors,
  WARNING_MESSAGES,
} from "~/consts.ts";
import type { ValItemType } from "~/types.ts";
import { basename, dirname, join } from "@std/path";
import type {
  ItemStatus,
  ItemStatusManager,
} from "~/vt/lib/utils/ItemStatusManager.ts";

/**
 * Displays file changes and summary information from a FileStateChanges
 *
 * @param fileStateChanges The file state changes, containing modified, created, and deleted files
 * @param options Display options
 * @param options.headerText Custom header text to display before file changes
 * @param options.summaryText Text to show before the summary
 * @param options.emptyMessage Message to show when there are no changes
 * @param options.showEmpty Whether to show output when there are no changes
 * @param options.includeSummary Whether to display the summary
 * @param options.includeTypes Whether to display the (detected) types of the files
 * @param options.showWarnings Whether to display warnings associated with files
 * @returns string The formatted output string
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
    showWarnings?: boolean;
  },
): string {
  const {
    headerText: headerText,
    summaryText: summaryPrefix = "Summary:",
    emptyMessage,
    showEmpty = true,
    includeSummary = true,
    includeTypes = true,
    showWarnings = true,
  } = options;
  const output: string[] = [];

  const fileStateChangesEntriesSorted = fileStateChanges
    .entries({ sorted: true });

  const totalChanges = fileStateChanges
    .filter((f) => f.status !== "not_modified")
    .filter((f) => !f.warnings || f.warnings.length === 0).changes();

  // Exit early if we do not show empty
  if (totalChanges === 0 && !showEmpty) return "";

  // Calculate the longest type length from all files
  const maxTypeLength = fileStateChangesEntriesSorted
    .filter(([type]) => type !== "not_modified")
    .flatMap(([_, files]) => files)
    .reduce((max, file) => {
      // Get the actual string representation that will be displayed
      const typeStr = TypeToTypeStr[file.type];
      return Math.max(max, typeStr.length);
    }, 0);

  // Get all files with warnings
  const filesWithWarnings = fileStateChangesEntriesSorted
    .flatMap(([_, files]) => files)
    .filter((file) => file.warnings && file.warnings.length > 0);

  // Get files without warnings for regular display
  const fileStateChangesWithoutWarnings = new Map(
    fileStateChangesEntriesSorted.map(([status, files]) => [
      status,
      files.filter((file) => !file.warnings || file.warnings.length === 0),
    ]),
  );

  // Count successful changes (files without warnings)
  const successfulChanges = Array.from(
    fileStateChangesWithoutWarnings.entries(),
  )
    .filter(([type]) => type !== "not_modified")
    .reduce((sum, [_, files]) => sum + files.length, 0);

  // Print all changed files state (excluding files with warnings)
  if (successfulChanges > 0) {
    // Display header if provided and there are successful changes
    if (headerText) output.push(headerText);

    for (const [type, files] of fileStateChangesWithoutWarnings.entries()) {
      if (type !== "not_modified" && files.length > 0) {
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
  }

  if (successfulChanges > 0 && showWarnings && filesWithWarnings.length > 0) {
    output.push(""); // Add a newline gap if needed
  }

  // Display failures/warnings in a dedicated section
  if (showWarnings && filesWithWarnings.length > 0) {
    output.push("Failures:");

    for (const file of filesWithWarnings) {
      output.push(
        "  " + formatStatus(
          file,
          includeTypes ? file.type : undefined,
          maxTypeLength,
        ),
      );

      const warningMessages = file.warnings!.map((warning, index) => {
        const prettyWarning = WARNING_MESSAGES[warning] || warning;
        const prefix = index === 0 ? "Error:" : "      ";
        return "      " + colors.yellow(prefix + " " + prettyWarning);
      });

      output.push(...warningMessages.map((m) => "  " + m));
    }
  }

  // Provide a summary if requested and there are changes
  if (includeSummary && totalChanges > 0) {
    output.push("\n" + summaryPrefix);

    // Count files by status, excluding those with warnings
    for (const [type, files] of fileStateChangesWithoutWarnings.entries()) {
      if (type !== "not_modified" && files.length > 0) {
        const typeColor = STATUS_STYLES[type];
        const coloredType = typeColor.color(type);
        output.push("  " + files.length + " " + coloredType);
      }
    }

    // If we have failures, add them to the summary
    if (filesWithWarnings.length > 0) {
      output.push("  " + filesWithWarnings.length + " " + colors.red("failed"));
    }
  } else if (
    totalChanges === 0 &&
    emptyMessage &&
    !fileStateChanges.hasWarnings()
  ) {
    output.push(colors.green(emptyMessage));
  }

  return output.join("\n");
}

function formatStatus(
  file: ItemStatus,
  type?: ValItemType,
  maxTypeLength: number = 0,
): string {
  const styleConfig = STATUS_STYLES[file.status];

  // Format path section
  const pathDisplay = formatPathDisplay(file, styleConfig);

  // Format type indicator if provided
  const typeIndicator = formatTypeIndicator(type, maxTypeLength);

  // Construct the final formatted string with all parts that exist
  const parts = [
    styleConfig.color(styleConfig.prefix),
    typeIndicator,
    pathDisplay,
  ].filter(Boolean);

  return parts.join(" ");
}

// Format the path display section based on file status
function formatPathDisplay(file: ItemStatus, styleConfig: {
  color: (text: string) => string;
  prefix: string;
}): string {
  if (file.status === "renamed") {
    const oldPathFormatted = join(
      dirname(file.oldPath),
      styleConfig.color(basename(file.oldPath)),
    );

    const newPathFormatted = join(
      dirname(file.path),
      styleConfig.color(basename(file.path)),
    );

    const similarityText = colors.gray(
      `(${(file.similarity * 100).toFixed(2)}%)`,
    );

    return `${oldPathFormatted}${
      colors.dim(" -> ")
    }${newPathFormatted} ${similarityText}`;
  }

  return join(
    dirname(file.path),
    styleConfig.color(basename(file.path)),
  );
}

// Format type indicator with proper padding and colors
function formatTypeIndicator(
  type?: ValItemType,
  maxTypeLength: number = 0,
): string {
  if (type === undefined) {
    return "";
  }

  const typeStr = TypeToTypeStr[type];
  const paddedTypeStr = typeStr.padEnd(maxTypeLength);

  return colors.gray("(") + ValItemColors[type](paddedTypeStr) +
    colors.gray(")");
}
