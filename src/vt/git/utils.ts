import sdk from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";

/**
 * Retrieves the ID of the default branch for a given project.
 *
 * @param {string} projectId - ID of project
 * @returns Promise that resolves to the branch ID as a string.
 * @throws Error if the main branch is not found.
 */
export async function getMainBranchId(projectId: string): Promise<string> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name === DEFAULT_BRANCH_NAME) return branch.id;
  }

  throw new Error(`Branch "${DEFAULT_BRANCH_NAME}" not found`);
}

/**
 * Create a temporary directory for testing.
 *
 * @param label - A label to append to the temporary directory name.
 * @returns An object containing the path to the temporary directory and a cleanup function to remove it.
 */
export async function getTestDir(
  label: string,
): Promise<{ testDir: string; cleanup: () => void }> {
  const testDir = await Deno.makeTempDir({
    prefix: "vt_",
    suffix: `_${label}`,
  });

  return {
    testDir,
    cleanup: async () => await Deno.remove(testDir, { recursive: true }),
  };
}
