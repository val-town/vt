import { colors } from "@cliffy/ansi/colors";

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
export function displayVersionRange(
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
