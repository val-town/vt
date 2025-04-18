import { VAL_TOWN_PROJECT_URL_REGEX } from "~/consts.ts";

/**
 * Parses a project identifier from various formats:
 * - username/projectName or @username/projectName
 * - projectName (using currentUsername)
 * - Any val.town URL containing /x/username/projectName
 *
 * @param {string} projectUri - The project identifier to parse
 * @param {string} currentUsername - Fallback username if not specified
 * @returns The extracted ownerName and projectName
 * @throws Error on invalid format
 */
export function parseProjectUri(
  projectUri: string,
  currentUsername: string,
): { ownerName: string; projectName: string } {
  // Handle val.town URLs
  if (projectUri.includes("val.town/")) {
    const match = projectUri.match(VAL_TOWN_PROJECT_URL_REGEX);

    if (match) {
      const [, ownerName, projectName] = match;
      return { ownerName, projectName };
    }

    // If we get here, it's a val.town URL but not in the expected format
    throw new Error("Invalid val.town URL format");
  } else {
    // Handle non-URL formats
    const parts = projectUri.replace(/^@/, "").split("/");

    let ownerName: string;
    let projectName: string;

    if (parts.length === 1) {
      ownerName = currentUsername;
      projectName = parts[0];
    } else if (parts.length === 2) {
      [ownerName, projectName] = parts;
    } else {
      throw new Error(
        "Invalid project URI. Must be a URL or a URI (username/projectName or @username/projectName)",
      );
    }

    return { ownerName, projectName };
  }
}
