import sdk from "~/sdk.ts";
import type ValTown from "@valtown/sdk";
import { ensureDir } from "@std/fs";

/**
 * Creates a new Val Town project and initializes it in the specified directory.
 *
 * @param {object} args
 * @param {string} args.targetDir The directory where the project will be initialized
 * @param {string} args.projectName The name of the project to create
 * @param {'public' | 'private' | 'unlisted'} args.privacy The privacy setting for the project
 * @param {string} [args.description] Optional description for the project
 * @returns {Promise<{projectId: string}>} The ID of the created project
 */
export async function create(
  {
    targetDir,
    projectName,
    privacy,
    description,
  }: {
    targetDir: string;
    projectName: string;
    privacy: "public" | "private" | "unlisted";
    description?: string;
  },
): Promise<{ projectId: string }> {
  // Create the project directory if it doesn't exist
  await ensureDir(targetDir);

  // Create the project using the SDK
  const project = await sdk.projects.create({
    name: projectName,
    privacy: privacy,
    description: description || "",
  });

  return {
    projectId: project.id,
  };
}
