import { assertEquals } from "@std/assert";
import {
  branchNameToBranch,
  createNewVal,
  deleteVal,
  randomValName,
} from "~/sdk.ts";
import { asPosixPath } from "~/utils.ts";

export interface ExpectedValInode {
  path: string;
  type: "file" | "directory";
  content?: string;
}

/**
 * Creates a temporary Val and executes an operation with it.
 * Provides Val and branch information to the operation callback.
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
  // Create a blank Val with a random name
  const val = await createNewVal({
    name: randomValName(),
    description: "This is a test val",
    privacy: "public",
  });

  // Get the main branch ID
  const branch = await branchNameToBranch(val.id, "main");

  try {
    // Execute the provided operation with Val info
    return await op({ val, branch });
  } finally {
    await deleteVal(val.id);
  }
}

export function assertPathEquals(
  actual: string,
  expected: string,
  msg?: string,
) {
  assertEquals(asPosixPath(actual), asPosixPath(expected), msg);
}
