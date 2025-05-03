import sdk, {
  branchNameToBranch,
  randomProjectName,
} from "../../../../utils/sdk.ts";

export interface ExpectedProjectInode {
  path: string;
  type: "file" | "directory";
  content?: string;
}

/**
 * Creates a temporary project and executes an operation with it.
 * Provides project and branch information to the operation callback.
 *
 * @param op Function that takes a project, branch, and returns a Promise
 * @returns Promise that resolves to the result of the operation
 */
export async function doWithNewProject<T>(
  op: (
    projectInfo: {
      project: { id: string; name: string };
      branch: { id: string; version: number };
    },
  ) => Promise<T>,
): Promise<T> {
  // Create a blank project with a random name
  const project = await sdk.projects.create({
    name: randomProjectName(),
    description: "This is a test project",
    privacy: "public",
  });

  // Get the main branch ID
  const branch = await branchNameToBranch(project.id, "main");

  try {
    // Execute the provided operation with project info
    return await op({ project, branch });
  } finally {
    await sdk.projects.delete(project.id);
  }
}
