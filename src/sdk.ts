import ValTown from "@valtown/sdk";
import "@std/dotenv/load";
import { memoize } from "@std/cache";
import { API_KEY_KEY, DEFAULT_BRANCH_NAME } from "~/consts.ts";

const sdk = new ValTown({ bearerToken: Deno.env.get(API_KEY_KEY)! });

/**
 * Checks if a project exists.
 *
 * @param {string} projectId - The ID of the project to check
 * @returns {Promise<boolean>} Promise resolving to true if the project exists, false otherwise
 */
export async function projectExists(projectId: string): Promise<boolean>;
/**
 * Checks if a project exists.
 *
 * @param {object} options - Project identification options
 * @param {string} options.username - The username of the project owner
 * @param {string} options.projectName - The name of the project to check
 * @returns {Promise<boolean>} Promise resolving to true if the project exists, false otherwise
 */
export async function projectExists(options: {
  username: string;
  projectName: string;
}): Promise<boolean>;
export async function projectExists(
  projectIdOrOptions: string | { username: string; projectName: string },
): Promise<boolean> {
  try {
    if (typeof projectIdOrOptions === "string") {
      // Project ID provided
      const projectId = projectIdOrOptions;
      await sdk.projects.retrieve(projectId);
    } else {
      // Username and project name provided
      const { username, projectName } = projectIdOrOptions;
      await sdk.alias.username.projectName.retrieve(username, projectName);
    }
    return true;
  } catch (error) {
    if (error instanceof ValTown.APIError && error.status === 404) {
      return false;
    }
    throw error; // Re-throw if it's not a 404 error
  }
}

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
export async function branchNameToBranch(
  projectId: string,
  branchName: string,
): Promise<ValTown.Projects.Branches.BranchListResponse> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name == branchName) return branch;
  }

  throw new Deno.errors.NotFound(`Branch "${branchName}" not found in project`);
}

/**
 * Checks if a file exists at the specified path in a project
 *
 * @param {string} projectId - The ID of the project containing the file
 * @param {string} filePath - The file path to check
 * @param {string} branchId - The ID of the project branch to reference
 * @param {number} version - The version of the project to check
 * @returns {Promise<boolean>} Promise resolving to true if the file exists, false otherwise
 */
export async function projectItemExists(
  projectId: string,
  branchId: string,
  filePath: string,
  version: number,
): Promise<boolean> {
  try {
    const item = await getProjectItem(projectId, branchId, version, filePath);
    return item !== undefined;
  } catch (e) {
    if (e instanceof ValTown.APIError && e.status === 404) {
      return false;
    } else throw e;
  }
}

/**
 * Converts a file path to its corresponding project item for a given project.
 *
 * @param {string} projectId - The ID of the project containing the file
 * @param {object} options - The options object
 * @param {string} options.branchId - The ID of the project branch to reference
 * @param {number} [options.version] - The version of the project for the file being found (optional)
 * @param {string} options.filePath - The file path to locate
 * @returns {Promise<ValTown.Projects.FileRetrieveResponse|undefined>} Promise resolving to the file data or undefined if not found
 */
export const getProjectItem = memoize(async (
  projectId: string,
  branchId: string,
  version: number,
  filePath: string,
): Promise<ValTown.Projects.FileRetrieveResponse | undefined> => {
  const projectItems = await listProjectItems(projectId, branchId, version);

  for (const filepath of projectItems) {
    if (filepath.path === filePath) return filepath;
  }

  return undefined;
});

/**
  * Lists all file paths in a project with pagination support.
  *
  * @param {string} projectId The ID of the project.
  * @param {Object} params The parameters for listing project items.
  * @param {string} params.path Path to a file or directory (e.g. 'dir/subdir/file.ts'). Pass in an empty string for
 root.
  * @param {string} [params.branch_id] The ID of the project branch to reference. Defaults to main.
  * @param {number} [params.version] - The version of the project. Defaults to latest.
  * @param {boolean} [params.options.recursive] Whether to recursively list files in subdirectories.
  * @returns {Promise<ValTown.Projects.FileRetrieveResponse[]>} Promise resolving to a Set of file paths.
  */
export const listProjectItems = memoize(async (
  projectId: string,
  branchId: string,
  version: number,
): Promise<ValTown.Projects.FileRetrieveResponse[]> => {
  const files: ValTown.Projects.FileRetrieveResponse[] = [];

  branchId = branchId ||
    (await branchNameToBranch(projectId, DEFAULT_BRANCH_NAME)
      .then((resp) => resp.id))!;

  for await (
    const file of sdk.projects.files.retrieve(projectId, {
      path: "",
      branch_id: branchId,
      version,
      recursive: true,
    })
  ) files.push(file);

  return files;
});

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
 * Get the owner of the API key used to auth the current ValTown instance.
 */
export const getCurrentUser = memoize(async () => {
  return await sdk.me.profile.retrieve();
});

export default sdk;
