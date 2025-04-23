import sdk, { branchNameToBranch, randomValName } from "~/sdk.ts";

export interface ExpectedValInode {
  path: string;
  type: "file" | "directory";
  content?: string;
}

/**
 * Creates a temporary val and executes an operation with it.
 * Provides val and branch information to the operation callback.
 *
 * @param op Function that takes a val, branch, and returns a Promise
 * @returns Promise that resolves to the result of the operation
 */
export async function doWithNewVal<T>(
  op: (
    valInfo: {
      val: { id: string; name: string };
      branch: { id: string; version: number };
    },
  ) => Promise<T>,
): Promise<T> {
  // Create a blank val with a random name
  const val = await sdk.vals.create({
    name: randomValName(),
    description: "This is a test val",
    privacy: "public",
  });

  // Get the main branch ID
  const branch = await branchNameToBranch(val.id, "main");

  try {
    // Execute the provided operation with val info
    return await op({ val, branch });
  } finally {
    await sdk.vals.delete(val.id);
  }
}
