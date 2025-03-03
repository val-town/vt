import ValTown from "@valtown/sdk";
import "@std/dotenv/load";
import { API_KEY_KEY } from "~/consts.ts";

const sdk = new ValTown({
  bearerToken: Deno.env.get(API_KEY_KEY)!,
});

/**
 * Converts a branch name to its corresponding branch ID for a given project.
 *
 * @param {string} projectId The ID of the project containing the branch
 * @param {string} branchName The name of the branch to look up
 * @returns {Promise} Promise resolving to the branch ID
 * @throws {Error} if the branch is not found or if the API request fails
 */
export async function branchIdToName(
  projectId: string,
  branchName: string,
): Promise<string> {
  // Because of a val town bug (see
  // https://www.val.town/v/wolf/ecstaticPeachRat), only unauthenticated
  // requests can query data on val town branches.
  //
  // TODO: change this to use branch alias API when it gets added

  const response = await fetch(
    `https://api.val.town/v1/projects/${projectId}/branches?limit=100`,
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch branches: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  // deno-lint-ignore no-explicit-any
  const branch = data.data.find((b: any) => b.name === branchName);

  if (!branch) {
    throw new Error(
      `Branch "${branchName}" not found in project "${projectId}"`,
    );
  }

  return branch.id;
}

export const user = await sdk.me.profile.retrieve();
export default sdk;
