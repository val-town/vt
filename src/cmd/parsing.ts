/**
 * Parses a project URI, either username/projectName, projectName (with
 * defaulted username), or `https://www.val.town/x/username/exampleProject`.
 *
 * @param {string} input - The input provided by the user, either a URL or a project URI.
 * @param {string} currentUsername - The current user's username, if the project URI doesn't specify an owner.
 * @returns The ownerName and projectName extracted from the input.
 * @throws An error if the input format is invalid.
 */
export function parseProjectUri(
  input: string,
  currentUsername: string,
): { ownerName: string; projectName: string } {
  const urlRegex = /^http[s]?:\/\/www\.val\.town\/x\/([^\/]+)\/([^\/]+)$/;
  const urlMatch = input.match(urlRegex);

  if (urlMatch) {
    const [, ownerName, projectName] = urlMatch;
    return { ownerName, projectName };
  } else {
    const parts = input.split("/");

    let ownerName: string;
    let projectName: string;

    if (parts.length === 1) {
      ownerName = currentUsername;
      projectName = parts[0];
    } else if (parts.length === 2) {
      [ownerName, projectName] = parts;
    } else {
      throw new Error(
        "Invalid project URI. Must be a URL or a URI (username/projectName)",
      );
    }

    return { ownerName, projectName };
  }
}
