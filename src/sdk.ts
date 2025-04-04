import ValTown from "@valtown/sdk";
import "@std/dotenv/load";
import { API_KEY_KEY, DEFAULT_BRANCH_NAME } from "~/consts.ts";

const sdk = new ValTown({ bearerToken: Deno.env.get(API_KEY_KEY)! });

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
 * Converts a file path to its corresponding project item for a given project.
 *
 * @param {string} projectId - The ID of the project containing the file
 * @param {object} options - The options object
 * @param {string} options.branchId - The ID of the project branch to reference
 * @param {number} [options.version] - The version of the project for the file being found (optional)
 * @param {string} options.filePath - The file path to locate
 * @returns {Promise<ValTown.Projects.FileRetrieveResponse|undefined>} Promise resolving to the file data or undefined if not found
 */
export async function getProjectItem(
  projectId: string,
  { branchId, version, filePath }: {
    branchId?: string;
    version?: number;
    filePath: string;
  },
): Promise<ValTown.Projects.FileRetrieveResponse | undefined> {
  branchId = (branchId ||
    await branchNameToBranch(projectId, DEFAULT_BRANCH_NAME).then((resp) =>
      resp.id
    ))!;
  version = version || (await getLatestVersion(projectId, branchId));

  for await (
    const filepath of await sdk.projects.files.retrieve(
      projectId,
      { path: "", branch_id: branchId, version, recursive: true },
    )
  ) if (filepath.path === filePath) return filepath;
}

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
): Promise<ValTown.Projects.FileRetrieveResponse[]> {
  const files: ValTown.Projects.FileRetrieveResponse[] = [];

  branch_id = branch_id ||
    (await branchNameToBranch(projectId, DEFAULT_BRANCH_NAME)
      .then((resp) => resp.id))!;
  version = version || (await getLatestVersion(projectId, branch_id));

  for await (
    const file of sdk.projects.files.retrieve(projectId, {
      path,
      branch_id,
      version,
      recursive,
    })
  ) files.push(file);

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
export const user = await sdk.me.profile.retrieve();

export default sdk;
