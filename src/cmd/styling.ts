import { colors } from "@cliffy/ansi/colors";
import { STATUS_COLORS } from "~/consts.ts";

export const error = colors.bold.red;
export const success = colors.bold.green;

/**
 * Formats a file path with a colored status prefix for display.
 *
 * @param {string} path - The file or directory path to format
 * @param {string} status - The status string that determines the prefix and color
 * @returns {string} A formatted string with colored prefix and path
 */
export function formatStatus(path: string, status: string): string {
  const config = STATUS_COLORS[status] || { prefix: " ", color: colors.gray };
  return `${config.color(config.prefix)} ${path}`;
}
