import valtown from "~/valtown.ts";
import { dirname, join } from "jsr:@std/path";
import { ensureDir } from "jsr:@std/fs";

/**
 * Maps Val Town file types to their extensions
 */
const FILE_TYPE_EXTENSIONS: Record<string, string> = {
  "file": ".tsx",
  "script": ".S.tsx",
  "http": ".H.tsx",
  "email": ".E.tsx",
  "interval": ".I.tsx",
};

/**
 * Clones a Val Town project to the specified directory
 *
 * @param targetDir Directory to clone the project into
 * @param projectId ID of the project to clone (optional, defaults to looking up from .valtown.json)
 */
export async function clone(
  targetDir: string,
  projectId: string,
  branchId: string,
  version?: number
): Promise<void> {
  // Get all files in project recursively
  const files = await valtown.projects.files
    .list(projectId, { recursive: true, branch_id: branchId, version });

  // Create project directory if it doesn't exist
  await ensureDir(targetDir);

  // Process all files and directories
  for (const file of files.data) {
    if (file.type === "directory") {
      // Create directory
      await ensureDir(join(targetDir, file.path));
      continue;
    }

    // Handle all file types (including special types)
    const extension = FILE_TYPE_EXTENSIONS[file.type] || ".tsx";
    const fileName = file.path.endsWith(extension)
      ? file.path
      : `${file.path}${extension}`;
    const fullPath = join(targetDir, fileName);

    // Ensure parent directory exists
    await ensureDir(dirname(fullPath));

    // Get and write file content
    const content = await valtown.projects.files.content(projectId, file.path);
    await Deno.writeTextFile(
      fullPath,
      typeof content === "string" ? content : JSON.stringify(content, null, 2),
    );
  }
}
