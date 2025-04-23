import ValTown from "@valtown/sdk";
import "@std/dotenv/load";
import { memoize } from "@std/cache";
import { API_KEY_KEY, DEFAULT_BRANCH_NAME } from "~/consts.ts";

const sdk = new ValTown({ bearerToken: Deno.env.get(API_KEY_KEY)! });

/**
 * Checks if a val exists.
 *
 * @param {string} valId The ID of the val to check
 * @returns {Promise<boolean>} True if the val exists, false otherwise
 */
export async function valExists(valId: string): Promise<boolean>;
/**
 * Checks if a val exists.
 *
 * @param {object} options Val identification options
 * @param {string} options.username The username of the val owner
 * @param {string} options.valName The name of the val to check
 * @returns {Promise<boolean>} Promise resolving to true if the val exists, false otherwise
 */
export async function valExists(options: {
  username: string;
  valName: string;
}): Promise<boolean>;
export async function valExists(
  valIdOrOptions: string | { username: string; valName: string },
): Promise<boolean> {
  try {
    if (typeof valIdOrOptions === "string") {
      // Val ID provided
      const valId = valIdOrOptions;
      await sdk.vals.retrieve(valId);
    } else {
      // Username and val name provided
      const { username, valName } = valIdOrOptions;
      await sdk.alias.username.valName.retrieve(username, valName);
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
 * Checks if a branch with the given name exists in a val.
 *
 * @param {string} valId The ID of the val to check
 * @param {string} branchName The name of the branch to check for
 * @returns {Promise<boolean>} Promise resolving to true if the branch exists, false otherwise
 */
export async function branchExists(
  valId: string,
  branchName: string,
): Promise<boolean> {
  for await (const branch of sdk.vals.branches.list(valId, {})) {
    if (branch.name == branchName) return true;
  }
  return false;
}

/**
 * Converts a branch name to its corresponding branch ID for a given val.
 *
 * @param {string} valId The ID of the val containing the branch
 * @param {string} branchName The name of the branch to look up
 * @returns {Promise} Promise resolving to the branch ID
 * @throws {Deno.errors.NotFound} if the branch is not found or if the API request fails
 */
export async function branchNameToBranch(
  valId: string,
  branchName: string,
): Promise<ValTown.Vals.Branches.BranchListResponse> {
  for await (const branch of sdk.vals.branches.list(valId, {})) {
    if (branch.name == branchName) return branch;
  }

  throw new Deno.errors.NotFound(`Branch "${branchName}" not found in val`);
}

/**
 * Checks if a file exists at the specified path in a val
 *
 * @param {string} valId The ID of the val containing the file
 * @param {string} filePath The file path to check
 * @param {string} branchId The ID of the val branch to reference
 * @param {number} version The version of the val to check
 * @returns {Promise<boolean>} Promise resolving to true if the file exists, false otherwise
 */
export async function valItemExists(
  valId: string,
  branchId: string,
  filePath: string,
  version: number,
): Promise<boolean> {
  try {
    const item = await getValItem(valId, branchId, version, filePath);
    return item !== undefined;
  } catch (e) {
    if (e instanceof ValTown.APIError && e.status === 404) {
      return false;
    } else throw e;
  }
}

/**
 * Converts a file path to its corresponding val item for a given val.
 *
 * @param {string} valId - The ID of the val containing the file
 * @param {object} options - The options object
 * @param {string} options.branchId - The ID of the val branch to reference
 * @param {number} [options.version] - The version of the val for the file being found (optional)
 * @param {string} options.filePath - The file path to locate
 * @returns {Promise<ValTown.Vals.FileRetrieveResponse|undefined>} Promise resolving to the file data or undefined if not found
 */
export const getValItem = memoize(async (
  valId: string,
  branchId: string,
  version: number,
  filePath: string,
): Promise<ValTown.Vals.FileRetrieveResponse | undefined> => {
  const valItems = await listValItems(valId, branchId, version);

  for (const filepath of valItems) {
    if (filepath.path === filePath) return filepath;
  }

  return undefined;
});

/**
  * Lists all file paths in a val with pagination support.
  *
  * @param {string} valId The ID of the val.
  * @param {Object} params The parameters for listing val items.
  * @param {string} params.path Path to a file or directory (e.g. 'dir/subdir/file.ts'). Pass in an empty string for
 root.
  * @param {string} [params.branch_id] The ID of the val branch to reference. Defaults to main.
  * @param {number} [params.version] - The version of the val. Defaults to latest.
  * @param {boolean} [params.options.recursive] Whether to recursively list files in subdirectories.
  * @returns {Promise<ValTown.Vals.FileRetrieveResponse[]>} Promise resolving to a Set of file paths.
  */
export const listValItems = memoize(async (
  valId: string,
  branchId: string,
  version: number,
): Promise<ValTown.Vals.FileRetrieveResponse[]> => {
  const files: ValTown.Vals.FileRetrieveResponse[] = [];

  branchId = branchId ||
    (await branchNameToBranch(valId, DEFAULT_BRANCH_NAME)
      .then((resp) => resp.id))!;

  for await (
    const file of sdk.vals.files.retrieve(valId, {
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
export async function getLatestVersion(valId: string, branchId: string) {
  return (await sdk.vals.branches.retrieve(valId, branchId)).version;
}

/**
 * Generate a random (valid) val name. Useful for tests.
 */
export function randomValName(label = "") {
  return `a${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}_${label}`;
}

/**
 * The owner of the API key used to auth the current ValTown instance.
 */
export const user = await sdk.me.profile.retrieve();

export default sdk;
