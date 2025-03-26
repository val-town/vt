import ValTown from "@valtown/sdk";
import "@std/dotenv/load";
import { API_KEY_KEY } from "~/consts.ts";

const sdk = new ValTown({
  bearerToken: Deno.env.get(API_KEY_KEY)!,
});

/**
 * Checks if a branch with the given name exists in a project.
 *
 * @param {string} projectId - The ID of the project to check
 * @param {string} branchName - The name of the branch to check for
 * @returns {Promise<boolean>} Promise resolving to true if the branch exists, false otherwise
 */
export async function branchExists(
  projectId: string,
  branchName: string,
): Promise<boolean> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name == branchName) return true;
  }
  return false;
}

/**
 * Converts a branch name to its corresponding branch ID for a given project.
 *
 * @param {string} projectId - The ID of the project containing the branch
 * @param {string} branchName - The name of the branch to look up
 * @returns {Promise} Promise resolving to the branch ID
 * @throws {Deno.errors.NotFound} if the branch is not found or if the API request fails
 */
async function branchIdToBranch(
  projectId: string,
  branchName: string,
): Promise<ValTown.Projects.Branches.BranchListResponse> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name == branchName) return branch;
  }

  throw new Deno.errors.NotFound(`Branch "${branchName}" not found in project`);
}

/**
 * Converts a file path to its corresponding project file for a given project.
 *
 * @param {string} projectId The ID of the project containing the file
 * @param {string} branchId The ID of the project branch to reference
 * @param {number} version The version of the project for the file being found
 * @param {string} filePath The file path to locate
 * @returns {Promise<ValTown.Projects.FileRetrieveResponse.Data>} Promise resolving to the file data
 * @throws {Error} if the file is not found or if the API request fails
 */
async function filePathToFile(
  projectId: string,
  branchId: string,
  version: number | undefined = undefined,
  filePath: string,
): Promise<ValTown.Projects.FileRetrieveResponse.Data> {
  // Get all files in the project
  const filePaths = await listProjectItems(
    projectId,
    {
      path: "",
      branch_id: branchId,
      version,
      recursive: true,
    },
  );

  const result = filePaths.find((file) => file.path === filePath);
  if (!result) {
    throw new Deno.errors.NotFound(`File "${filePath}" not found in project`);
  } else return result;
}

/**
 * Lists all file paths in a project with pagination support
 *
 * @param {string} projectId The ID of the project
 * @param {Object} params The parameters for listing project items
 * @param {string} params.path The root path to start listing from
 * @param {string} [params.branch_id] The ID of the project branch to reference. Defaults to main.
 * @param {number} [params.version] - The version of the project. Defaults to latest.
 * @param {Object} [params.options] Additional options for filtering
 * @param {boolean} [params.options.recursive=true] Whether to recursively list files in subdirectories
 * @returns {Promise<Set<string>>} Promise resolving to a Set of file paths
 * @throws {Error} if the API request fails
 */
export async function listProjectItems(
  projectId: string,
  {
    path,
    branch_id,
    version,
    recursive,
  }: {
    path: string;
    branch_id?: string;
    version?: number;
    recursive?: boolean;
  },
): Promise<ValTown.Projects.FileRetrieveResponse.Data[]> {
  const files: ValTown.Projects.FileRetrieveResponse.Data[] = [];
  let cursor = 0;
  const batchSize = 100; // Single, reasonable batch size

  while (true) {
    const resp = await sdk.projects.files.retrieve(projectId, {
      path,
      offset: cursor,
      limit: batchSize,
      branch_id,
      version,
      recursive,
    });

    // Add the files to our result array
    files.push(...resp.data);

    // If we got fewer items than the batch size, we've reached the end
    if (!resp.links.next) break;

    // Move to next batch
    cursor += batchSize;
  }

  return files;
}

/**
 * Get the latest version of a branch.
 */
export async function getLatestVersion(projectId: string, branchId: string) {
  return (await sdk.projects.branches.retrieve(projectId, branchId)).version;
}

/**
 * Generate a random (valid) project name. Useful for tests.
 */
export function randomProjectName(label = "") {
  return `a${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}_${label}`;
}

/**
 * The owner of the API key used to auth the current ValTown instance.
 */
const user = await sdk.me.profile.retrieve();

export { branchIdToBranch, filePathToFile, user };
export default sdk;
