import ValTown from "@valtown/sdk";
import { memoize } from "@std/cache";
import { API_KEY_KEY, DEFAULT_BRANCH_NAME } from "~/consts.ts";

const sdk = new ValTown({
  // Must get set in vt.ts entrypoint if not set as an env var!
  // It needs to be passed here though as *something*
  bearerToken: Deno.env.get(API_KEY_KEY) ?? crypto.randomUUID(),
});

/**
 * Checks if a Val exists.
 *
 * @param projectId - The ID of the project to check
 * @returns Promise resolving to whether the project exists
 */
export async function valExists(valId: string): Promise<boolean>;
/**
 * Checks if a Val exists.
 *
 * @param options Val identification options
 * @param options.username The username of the Val owner
 * @param options.valName The name of the Val to check
 * @returns Promise resolving to true if the Val exists, false otherwise
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
      // Username and Val name provided
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
 * @param valId The ID of the Val to check
 * @param branchName The name of the branch to check for
 * @returns Promise resolving to true if the branch exists, false otherwise
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
 * @param valId The ID of the Val containing the branch
 * @param branchName The name of the branch to look up
 * @returns Promise resolving to the branch ID
 * @throws if the branch is not found or if the API request fails
 */
export async function branchNameToBranch(
  valId: string,
  branchName: string,
): Promise<ValTown.Vals.Branches.BranchListResponse> {
  for await (const branch of sdk.vals.branches.list(valId, {})) {
    if (branch.name == branchName) return branch;
  }

  throw new Deno.errors.NotFound(`Branch "${branchName}" not found in Val`);
}

/**
 * Checks if a file exists at the specified path in a val
 *
 * @param valId The ID of the Val containing the file
 * @param filePath The file path to check
 * @param branchId The ID of the Val branch to reference
 * @param version The version of the Val to check
 * @returns Promise resolving to true if the file exists, false otherwise
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
 * Converts a file path to its corresponding Val item for a given val.
 *
 * @param valId - The ID of the Val containing the file
 * @param options - The options object
 * @param options.branchId - The ID of the Val branch to reference
 * @param [options.version] - The version of the Val for the file being found (optional)
 * @param options.filePath - The file path to locate
 * @returns Promise resolving to the file data or undefined if not found
 */
export const getValItem: (
  valId: string,
  branchId: string,
  version: number,
  filePath: string,
) => Promise<ValTown.Vals.Files.FileRetrieveResponse | undefined> = memoize(
  async (
    valId: string,
    branchId: string,
    version: number,
    filePath: string,
  ) => {
    const valItems = await listValItems(valId, branchId, version);

    for (const filepath of valItems) {
      if (filepath.path === filePath) return filepath;
    }

    return undefined;
  },
);

/**
 * Lists all file paths in a Val with pagination support.
 *
 * @param valId ID of the val
 * @param params Parameters for listing Val items
 * @param params.path Path to a file or directory (e.g. 'dir/subdir/file.ts'). Pass in an empty string for root.
 * @param [params.branch_id] The ID of the Val branch to reference. Defaults to main.
 * @param [params.version] - The version of the val. Defaults to latest.
 * @param [params.options.recursive] Whether to recursively list files in subdirectories
 * @returns Promise resolving to a Set of file paths
 */
export const listValItems: (
  valId: string,
  branchId: string,
  version: number,
) => Promise<ValTown.Vals.Files.FileRetrieveResponse[]> = memoize(async (
  valId: string,
  branchId: string,
  version: number,
) => {
  const files: ValTown.Vals.Files.FileRetrieveResponse[] = [];

  // If branchId is not provided, get the default branch id
  if (!branchId) {
    branchId = (await branchNameToBranch(valId, DEFAULT_BRANCH_NAME)
      .then((resp) => resp.id))!;
  }

  for await (
    const file of sdk.vals.files.retrieve(valId, {
      path: "",
      branch_id: branchId,
      version,
      recursive: true,
    })
  ) {
    files.push(file);
  }

  return files;
});

/**
 * Get the latest version of a branch.
 */
export async function getLatestVersion(
  valId: string,
  branchId: string,
): Promise<number> {
  return (await sdk.vals.branches.retrieve(valId, branchId)).version;
}

/**
 * Generate a random (valid) Val name. Useful for tests.
 */
export function randomValName(label = ""): string {
  return `a${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}_${label}`;
}

/**
 * Get the owner of the API key used to auth the current ValTown instance.
 */
export const getCurrentUser: () => Promise<
  ValTown.Me.Profile.ProfileRetrieveResponse
> = memoize(
  async () => {
    return await sdk.me.profile.retrieve();
  },
);

export default sdk;
