import { VAL_TOWN_VAL_URL_REGEX } from "~/consts.ts";

/**
 * Parses a Val identifier from various formats:
 * - username/valName or @username/valName
 * - valName (using currentUsername)
 * - Any val.town URL containing /x/username/valName
 *
 * @param {string} valUri - The Val identifier to parse
 * @param {string} currentUsername - Fallback username if not specified
 * @returns The extracted ownerName and valName
 * @throws Error on invalid format
 */
export function parseValUri(
  valUri: string,
  currentUsername: string,
): { ownerName: string; valName: string } {
  // Handle val.town URLs
  if (valUri.includes("val.town/")) {
    const match = valUri.match(VAL_TOWN_VAL_URL_REGEX);

    if (match) {
      const [, ownerName, valName] = match;
      return { ownerName, valName };
    }

    // If we get here, it's a val.town URL but not in the expected format
    throw new Error("Invalid val.town URL format");
  } else {
    // Handle non-URL formats
    const parts = valUri.replace(/^@/, "").split("/");

    let ownerName: string;
    let valName: string;

    if (parts.length === 1) {
      ownerName = currentUsername;
      valName = parts[0];
    } else if (parts.length === 2) {
      [ownerName, valName] = parts;
    } else {
      throw new Error(
        "Invalid Val URI. Must be a URL or a URI (username/valName or @username/valName)",
      );
    }

    return { ownerName, valName };
  }
}
