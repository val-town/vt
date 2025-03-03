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
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name == DEFAULT_BRANCH_NAME) return branch.id;
  }

  throw new Error(`Branch "${DEFAULT_BRANCH_NAME}" not found`);
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
