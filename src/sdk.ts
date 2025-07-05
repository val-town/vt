import ValTown from "@valtown/sdk";
import { memoize } from "@std/cache";
import manifest from "../deno.json" with { type: "json" };
import {
  API_KEY_KEY,
  DEFAULT_BRANCH_NAME,
  DEFAULT_VAL_PRIVACY,
} from "~/consts.ts";
import type { ValFileType, ValPrivacy } from "./types.ts";
import { arrayFromAsyncN, asPosixPath } from "./utils.ts";

const sdk = new ValTown({
  // Must get set in vt.ts entrypoint if not set as an env var!
  // It needs to be passed here though as *something*
  bearerToken: Deno.env.get(API_KEY_KEY) ?? crypto.randomUUID(),
  defaultHeaders: { "x-vt-version": String(manifest.version) },
});

/**
 * Generate a random (valid) Val name. Useful for tests.
 */
export function randomValName(label = "") {
  return `a${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}_${label}`;
}

/**
 * Get the owner of the API key used to auth the current ValTown instance.
 */
export const getCurrentUser = memoize(async () => {
  return await sdk.me.profile.retrieve();
});

/**
 * Checks if a Val exists.
 *
 * @param projectId - The ID of the project to check
 * @returns Promise resolving to whether the project exists
 */
export async function valExists(valId: string): Promise<boolean>;
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
 * Creates a new Val with the provided metadata.
 *
 * @param options Create options
 * @param options.name The name for the new val
 * @param options.description The description for the new val (optional)
 * @param options.privacy The privacy setting for the new val (optional)
 * @returns Promise resolving to the create response
 */
export async function createNewVal(options: {
  name: string;
  description?: string;
  privacy?: ValPrivacy;
}): Promise<ReturnType<typeof sdk.vals.create>> {
  const { name, description, privacy = DEFAULT_VAL_PRIVACY } = options;

  return await sdk.vals.create({
    name,
    description,
    privacy,
  });
}

/**
 * Deletes a Val by its ID.
 *
 * @param valId The ID of the Val to delete
 * @returns Promise resolving to the delete response
 */
export async function deleteVal(
  valId: string,
): Promise<ReturnType<typeof sdk.vals.delete>> {
  return await sdk.vals.delete(valId);
}

/**
 * Retrieves a Val by its ID.
 *
 * @param valId The ID of the Val to retrieve
 * @returns Promise resolving to the Val data
 */
export async function getVal(
  valId: string,
): Promise<ReturnType<typeof sdk.vals.retrieve>> {
  return await sdk.vals.retrieve(valId);
}

/**
 * Lists all Val Town vals owned by the current user.
 *
 * @returns Promise resolving to an array of Val Town vals
 */
export async function listMyVals(
  n: number = Number.POSITIVE_INFINITY,
): Promise<ValTown.Val[]> {
  return (await arrayFromAsyncN(sdk.me.vals.list({}), n))[0];
}

/**
 * Retrieves a Val by its name and the owner's username.
 *
 * @param username The username of the Val owner
 * @param valName The name of the Val to retrieve
 * @returns Promise resolving to the Val
 */
export async function valNameToVal(
  username: string,
  valName: string,
): Promise<ValTown.Val> {
  const { id } = await sdk.alias.username.valName.retrieve(username, valName);
  return await sdk.vals.retrieve(id);
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
    if (branch.name === branchName) return true;
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
    if (branch.name === branchName) return branch;
  }

  throw new Deno.errors.NotFound(`Branch "${branchName}" not found in Val`);
}

/**
 * Lists all branches in a Val.
 *
 * @param valId The ID of the Val to list branches for
 * @returns Promise resolving to an array of branchs
 */
export async function listBranches(
  valId: string,
): Promise<ValTown.Vals.Branches.BranchListResponse[]> {
  return await Array.fromAsync(sdk.vals.branches.list(valId, {}));
}

/**
 * Deletes a branch in a Val.
 *
 * @param valId The ID of the Val to delete the branch from
 * @param branchId The ID of the branch to delete
 * @returns Promise resolving to the delete response
 */
export async function deleteBranch(
  valId: string,
  branchId: string,
): Promise<ReturnType<typeof sdk.vals.branches.delete>> {
  return await sdk.vals.branches.delete(valId, branchId);
}

/**
 * Retrieves a branch by its id in a Val.
 *
 * @param valId The ID of the Val to retrieve the branch from
 * @param branchId The ID of the branch to retrieve
 * @returns Promise resolving to the branch data
 */
export async function getBranch(
  valId: string,
  branchId: string,
): Promise<ValTown.Vals.Branches.BranchRetrieveResponse> {
  return await sdk.vals.branches.retrieve(valId, branchId);
}

/**
 * Get the latest version of a branch.
 */
export async function getLatestVersion(valId: string, branchId: string) {
  return (await sdk.vals.branches.retrieve(valId, branchId)).version;
}

/**
 * Creates a new branch in a Val.
 *
 * @param valId The ID of the Val to create the branch in
 * @param options Branch creation options
 * @param options.name The name for the new branch
 * @param options.branchId The ID of the branch to fork from (optional)
 * @returns Promise resolving to the create response
 */
export async function createNewBranch(
  valId: string,
  options: {
    name: string;
    branchId?: string;
  },
): Promise<ReturnType<typeof sdk.vals.branches.create>> {
  const { name, branchId } = options;

  return await sdk.vals.branches.create(valId, {
    name,
    branchId,
  });
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
    const item = await getValItem(
      valId,
      branchId,
      version,
      asPosixPath(filePath),
    );
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
 * @param options.version - The version of the Val for the file being found (optional)
 * @param options.filePath - The file path to locate
 * @returns Promise resolving to the file data or undefined if not found
 */
export const getValItem = memoize(async (
  valId: string,
  branchId: string,
  version: number,
  filePath: string,
): Promise<ValTown.Vals.FileRetrieveResponse | undefined> => {
  const valItems = await listValItems(valId, branchId, version);
  const normalizedPath = asPosixPath(filePath);

  for (const filepath of valItems) {
    if (filepath.path === normalizedPath) return filepath;
  }

  return undefined;
});

/**
 * Get the content of a Val item.
 *
 * @param valId The ID of the Val
 * @param branchId The ID of the Val branch to reference
 * @param version The version of the Val
 * @param filePath The path to the file
 * @returns Promise resolving to the file content
 */
export const getValItemContent = memoize(
  async (
    valId: string,
    branchId: string,
    version: number,
    filePath: string,
  ): Promise<string> => {
    return await sdk.vals.files
      .getContent(valId, {
        path: asPosixPath(filePath),
        branch_id: branchId,
        version,
      })
      .then((resp) => resp.text());
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
export const listValItems = memoize(async (
  valId: string,
  branchId: string,
  version: number,
): Promise<ValTown.Vals.FileRetrieveResponse[]> => {
  branchId = branchId ||
    (await branchNameToBranch(valId, DEFAULT_BRANCH_NAME)
      .then((resp) => resp.id));

  const files = await Array.fromAsync(
    sdk.vals.files.retrieve(valId, {
      path: "",
      branch_id: branchId,
      version,
      recursive: true,
    }),
  );

  return files;
});

/**
 * Updates a Val file with the provided content and metadata.
 *
 * @param valId The ID of the Val to update
 * @param options Update options
 * @param options.path The current path of the file
 * @param options.branchId The ID of the branch to update
 * @param options.content The new content for the file
 * @param options.name The new name for the file (optional)
 * @param options.parentPath The new parent path for the file (optional)
 * @param options.type The type of the file (optional)
 * @returns Promise resolving to the update response
 */
export async function updateValFile(
  valId: string,
  options: {
    path: string;
    branchId: string;
    content?: string;
    name?: string;
    parentPath?: string | null;
    type?: ValFileType;
  },
): Promise<ReturnType<typeof sdk.vals.files.update>> {
  const { path, branchId, content, name, parentPath, type } = options;

  return await sdk.vals.files.update(valId, {
    path: asPosixPath(path),
    branch_id: branchId,
    content,
    name,
    parent_path: parentPath ? asPosixPath(parentPath) : parentPath,
    type,
  });
}

/**
 * Creates a new Val item with the provided content and metadata.
 *
 * @param valId The ID of the Val to create the file in
 * @param options Create options
 * @param options.path The path for the new file
 * @param options.branchId The ID of the branch to create in
 * @param options.content The content for the file (optional for directories)
 * @param options.type The type of the file
 * @returns Promise resolving to the create response
 */
export async function createValItem(
  valId: string,
  options:
    & { path: string; branchId: string }
    & ({ type: "directory" } | { content: string; type: ValFileType }),
): Promise<ReturnType<typeof sdk.vals.files.create>> {
  if (options.type === "directory") {
    // For directories, content is not needed
    return await sdk.vals.files.create(valId, {
      path: asPosixPath(options.path),
      branch_id: options.branchId,
      type: options.type,
    });
  }

  // For files, content is needed
  return await sdk.vals.files.create(valId, {
    path: asPosixPath(options.path),
    branch_id: options.branchId,
    content: options.content,
    type: options.type,
  });
}

/**
 * Deletes a Val file at the specified path.
 *
 * @param valId The ID of the Val containing the file to delete
 * @param options Delete options
 * @param options.path The path of the file to delete
 * @param options.branchId The ID of the branch to delete from
 * @param options.recursive Whether to recursively delete directories (optional)
 * @returns Promise resolving to the delete response
 */
export async function deleteValItem(
  valId: string,
  options: {
    path: string;
    branchId: string;
    recursive?: boolean;
  },
): Promise<ReturnType<typeof sdk.vals.files.delete>> {
  const { path, branchId, recursive } = options;

  return await sdk.vals.files.delete(valId, {
    path: asPosixPath(path),
    branch_id: branchId,
    recursive: !!recursive,
  });
}

/**
 * The actual stainless SDK instance for interacting with Val Town.
 *
 * In most cases, you should use the utility functions exported from this module, which
 * handle common operations and cases like file path normalization, etc.
 */
export default sdk;
