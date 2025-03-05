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
async function branchNameToId(
  projectId: string,
  branchName: string,
): Promise<string> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name == branchName) return branch.id;
  }

  throw new Error(`Branch "${branchName}" not found in project ${projectId}`);
}

/**
 * Get the latest version of a branch.
 */
export async function getLatestVersion(projectId: string, branchId: string) {
  return (await sdk.projects.branches.retrieve(projectId, branchId)).version;
}

const user = await sdk.me.profile.retrieve();

export { branchNameToId, user };
export default sdk;
