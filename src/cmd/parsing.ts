/**
 * Parses the project URI to extract the owner name and project name.
 *
 * Assumes a project URI is of the format username/projectName
 *
 * @param {string} projectUri - The project URI provided by the user.
 * @param {string} currentUsername - The current user's username.
 * @returns An object containing the ownerName and projectName.
 * @throws An error if the URI format is invalid.
 */
export function parseProjectUri(
  projectUri: string,
  currentUsername: string,
): { ownerName: string; projectName: string } {
  const parts = projectUri.split("/");

  let ownerName: string;
  let projectName: string;

  if (parts.length === 1) {
    ownerName = currentUsername;
    projectName = parts[0];
  } else if (parts.length === 2) {
    [ownerName, projectName] = parts;
  } else {
    throw new Error("Invalid project URI");
  }

  return { ownerName, projectName };
}
