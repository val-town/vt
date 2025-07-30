import ValTown from "@valtown/sdk";
import { memoize } from "@std/cache";
import manifest from "../deno.json" with { type: "json" };
import { API_KEY_KEY } from "~/consts.ts";
import { delay } from "@std/async";

const sdk = new ValTown({
  // Must get set in vt.ts entrypoint if not set as an env var!
  // It needs to be passed here though as *something*
  bearerToken: Deno.env.get(API_KEY_KEY) ?? crypto.randomUUID(),
  defaultHeaders: { "x-vt-version": String(manifest.version) },
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
 * Get the content of a Val item.
 *
 * @param {string} valId The ID of the Val
 * @param {string} branchId The ID of the Val branch to reference
 * @param {number} version The version of the Val
 * @param {string} filePath The path to the file
 * @returns {Promise<string>} Promise resolving to the file content
 */
export const getValItemContent = memoize(
  async (
    valId: string,
    branchId: string,
    version: number,
    filePath: string,
  ): Promise<string> => {
    return await sdk.vals.files
      .getContent(valId, { path: filePath, branch_id: branchId, version })
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
  return await Array.fromAsync(
    sdk.vals.files.retrieve(valId, {
      path: "",
      branch_id: branchId,
      version,
      recursive: true,
    }),
  );
});

/**
 * Get the latest version of a branch.
 */
export async function getLatestVersion(valId: string, branchId: string) {
  return (await sdk.vals.branches.retrieve(valId, branchId)).version;
}

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

export async function* getTraces({ branchIds, fileId, frequency = 1000 }: {
  branchIds: string[];
  fileId?: string;
  frequency?: number;
}): AsyncGenerator<ValTown.Telemetry.Traces.TraceListResponse.Data> {
  while (true) {
    let startTime = new Date(Date.now() - frequency);

    // Gather the range startTime:=(now - frequency) --> now
    let prevNextLink = "";
    while (true) {
      const listParams = {
        limit: 50,
        start: startTime.toISOString(),
        branch_ids: branchIds,
        file_id: fileId,
        order_by: "end_time",
      } satisfies ValTown.Telemetry.Traces.TraceListParams;

      const { links: newLinks, data: newData } = await sdk
        .telemetry
        .traces
        .list(listParams);

      if (newLinks.next === prevNextLink) break; // No new data, stop

      if (!newLinks.next) break;
      prevNextLink = newLinks.next;

      // The tail of the range we just received is the start of the new range
      const newStartTime = new Date(
        new URL(newLinks.next).searchParams.get("end")!,
      );
      if (newStartTime.getTime() === startTime.getTime()) break; // No new data, stop

      yield* newData;

      startTime = newStartTime; // Update startTime to the new start time
    }

    await delay(frequency);
  }
}

/**
 * Get all logs for a specific trace ID.
 *
 * @param traceId The trace ID to get logs for
 * @returns AsyncGenerator yielding all log entries for the trace
 */
export async function* getLogsForTraces(
  traceIds: string[],
): AsyncGenerator<ValTown.Telemetry.Logs.LogListResponse.Data> {
  let nextUrl: string | undefined;

  do {
    const response = await sdk.telemetry.logs.list({
      limit: 100,
      trace_ids: traceIds,
      ...(nextUrl && {
        end: new URL(nextUrl).searchParams.get("end")!,
      }),
    });

    for (const log of response.data) {
      yield log;
    }

    nextUrl = response.links.next;
  } while (nextUrl);
}

/**
 * Converts a file ID to its corresponding Val file for a given val.
 *
 * @param valId The ID of the Val containing the file
 * @param branchId The ID of the Val branch to reference
 * @param fileId The ID of the file to retrieve
 * @returns Promise resolving to the Val file data
 * @throws if the file is not found or if the API request fails
 */
export async function fileIdToValFile(
  valId: string,
  branchId: string,
  fileId: string,
  version?: number,
): Promise<ValTown.Vals.FileRetrieveResponse> {
  version = version ?? (await getLatestVersion(valId, branchId));
  const files = await listValItems(valId, branchId, version);
  const file = files.find((f) => f.id === fileId);
  if (!file) throw new Deno.errors.NotFound(`File with ID ${fileId} not found`);
  return file;
}

export default sdk;
