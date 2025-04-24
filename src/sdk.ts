import ValTown from "@valtown/sdk";
import "@std/dotenv/load";
import { memoize } from "@std/cache";
import { API_KEY_KEY, DEFAULT_BRANCH_NAME } from "~/consts.ts";

const sdk = new ValTown({ bearerToken: Deno.env.get(API_KEY_KEY)! });

/**
 * Checks if a project exists.
 *
 * @param projectId - The ID of the project to check
 * @returns Promise resolving to true if the project exists, false otherwise
 */
export async function projectExists(projectId: string): Promise<boolean>;
/**
 * Checks if a project exists.
 *
 * @param options Project identification options
 * @param options.username The username of the project owner
 * @param options.projectName The name of the project to check
 * @returns Promise resolving to true if the project exists, false otherwise
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
 * @param projectId - The ID of the project to check
 * @param branchName - The name of the branch to check for
 * @returns Promise resolving to true if the branch exists, false otherwise
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
 * @param projectId - The ID of the project containing the branch
 * @param branchName - The name of the branch to look up
 * @returns Promise resolving to the branch ID
 * @throws {Error} If branch is not found or if the API request fails
 */
export async function branchNameToBranch(
  projectId: string,
  branchName: string,
): Promise<ValTown.Projects.Branches.BranchListResponse> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name == branchName) return branch;
  }

  throw new Error(`Branch "${branchName}" not found in project`);
}

/**
 * Checks if a file exists at the specified path in a project
 *
 * @param projectId - The ID of the project containing the file
 * @param filePath - The file path to check
 * @param branchId - The ID of the project branch to reference
 * @param version - The version of the project to check
 * @returns Promise resolving to true if the file exists, false otherwise
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
 * @param projectId - The ID of the project containing the file
 * @param options - The options object
 * @param options.branchId - The ID of the project branch to reference
 * @param [options.version] - The version of the project for the file being found (optional)
 * @param options.filePath - The file path to locate
 * @returns Promise resolving to the file data or undefined if not found
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
  * @param projectId The ID of the project.
  * @param params The parameters for listing project items.
  * @param params.path Path to a file or directory (e.g. 'dir/subdir/file.ts'). Pass in an empty string for
 root.
  * @param [params.branch_id] The ID of the project branch to reference. Defaults to main.
  * @param [params.version] - The version of the project. Defaults to latest.
  * @param [params.options.recursive] Whether to recursively list files in subdirectories.
  * @returns Promise resolving to a Set of file paths.
  */
export const listProjectItems = memoize(async (
  projectId: string,
  branchId: string,
  version: number,
): Promise<ValTown.Projects.FileRetrieveResponse[]> => {
  branchId = branchId ||
    (await branchNameToBranch(projectId, DEFAULT_BRANCH_NAME)
      .then((resp) => resp.id))!;

  return await Array.fromAsync(sdk.projects.files.retrieve(projectId, {
    path: "",
    branch_id: branchId,
    version,
    recursive: true,
  }));
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
