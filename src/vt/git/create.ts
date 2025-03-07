import sdk from "~/sdk.ts";

/**
 * Creates a new Val Town project (does not clone it).
 *
 * @param {object} args
 * @param {string} args.projectName The name of the project to create
 * @param {'public' | 'private' | 'unlisted'} args.privacy The privacy setting for the project
 * @param {string} [args.description] Optional description for the project
 * @returns {Promise<{projectId: string}>} The ID of the created project
 */
export async function create(
  {
    projectName,
    privacy,
    description,
  }: {
    projectName: string;
    privacy: "public" | "private" | "unlisted";
    description?: string;
  },
): Promise<{ projectId: string }> {
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
