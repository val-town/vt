import ValTown from "@valtown/sdk";
import "@std/dotenv/load";
import { API_KEY_KEY, DEFAULT_BRANCH_NAME } from "~/consts.ts";

const sdk = new ValTown({
  bearerToken: Deno.env.get(API_KEY_KEY)!,
});

/**
 * Retrieves the ID of the default branch for a given project.
 *
 * @param {string} projectId The ID of the project to find the default branch for
 * @returns {Promise} Promise resolving to the ID of the default branch
 * @throws {Error} Error if the default branch is not found
 */
async function defaultBranchId(projectId: string): Promise<string> {
  return await getMainBranchId(projectId);
}

/**
 * Converts a branch name to its corresponding branch ID for a given project.
 *
 * @param {string} projectId The ID of the project containing the branch
 * @param {string} branchName The name of the branch to look up
 * @returns {Promise} Promise resolving to the branch ID
 * @throws {Error} if the branch is not found or if the API request fails
 */
async function branchIdToName(
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

/**
 * Retrieves the ID of the default branch for a given project.
 *
 * @param {string} projectId ID of the project
 * @returns Promise that resolves to the branch ID as a string
 * @throws {Error} If the main branch is not found
 */
async function getMainBranchId(projectId: string): Promise<string> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name === DEFAULT_BRANCH_NAME) return branch.id;
  }

  throw new Error(`Branch "${DEFAULT_BRANCH_NAME}" not found`);
}

const user = await sdk.me.profile.retrieve();

export { branchIdToName, defaultBranchId, getMainBranchId, user };
export default sdk;
