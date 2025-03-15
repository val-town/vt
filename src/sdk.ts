import ValTown from "@valtown/sdk";
import "@std/dotenv/load";
import { API_KEY_KEY } from "~/consts.ts";

const sdk = new ValTown({
  bearerToken: Deno.env.get(API_KEY_KEY)!,
});

/**
 * Converts a branch name to its corresponding branch ID for a given project.
 *
 * @param {string} projectId - The ID of the project containing the branch
 * @param {string} branchName - The name of the branch to look up
 * @returns {Promise} Promise resolving to the branch ID
 * @throws {Error} if the branch is not found or if the API request fails
 */
async function branchNameToId(
  projectId: string,
  branchName: string,
): Promise<ValTown.Projects.Branches.BranchListResponse> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name == branchName) return branch;
  }

  throw new Deno.errors.NotFound(
    `Branch "${branchName}" not found in project ${projectId}`,
  );
}

/**
 * Converts a file path to its corresponding project file for a given project.
 *
 * @param {string} projectId The ID of the project containing the file
 * @param {string} branchId The ID of the project branch to reference
 * @param {number} version The version of the project for the file being found
 * @param {string} filePath The file path to locate
 * @returns {Promise} Promise resolving to the branch ID
 * @throws {Error} if the branch is not found or if the API request fails
 */
async function filePathToFile(
  projectId: string,
  branchId: string,
  version: number,
  filePath: string,
): Promise<ValTown.Projects.Files.FileListResponse> {
  for await (
    const file of sdk.projects.files.list(projectId, {
      version,
      branch_id: branchId,
    })
  ) {
    if (file.name == filePath) return file;
  }

  throw new Deno.errors.NotFound(
    `Branch "${filePath}" not found in project ${projectId}`,
  );
}

/**
 * Get the latest version of a branch.
 */
export async function getLatestVersion(projectId: string, branchId: string) {
  return (await sdk.projects.branches.retrieve(projectId, branchId)).version;
}

/**
 * Generate a random (valid) project name.
 */
export function randomProjectName(label = "") {
  return `a${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}_${label}`;
}

const user = await sdk.me.profile.retrieve();

export { branchNameToId, filePathToFile, user };
export default sdk;
