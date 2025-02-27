import valtown from "~/valtown.ts";
import type Valtown from "@valtown/sdk";
import { dirname, join } from "jsr:@std/path";
import { ensureDir } from "jsr:@std/fs";

/**
 * Maps Val Town file types to their extensions
 */
const FILE_TYPE_EXTENSIONS: Record<string, string> = {
  "script": ".S.tsx",
  "http": ".H.tsx",
  "email": ".E.tsx",
  "interval": ".C.tsx",
};

/**
 * Clones a Val Town project, at a specific revision, to the specified directory
 *
 * @param targetDir Directory to clone the project into
 * @param projectId ID of the project to clone (optional, defaults to looking up from .valtown.json)
 * @param branchId ID of the branch to clone
 * @param version Version of the project to clone (optional, defaults to latest)
 */
export async function clone(
  targetDir: string,
  projectId: string,
  branchId: string,
  version?: number,
): Promise<void> {
  // Get all files in project recursively
  const files = await valtown.projects.files
    .list(projectId, { recursive: true, branch_id: branchId, version });

  // Create project directory if it doesn't exist
  await ensureDir(targetDir);

  // Process all files and directories
  for (const file of files.data) {
    const fullPath = join(targetDir, file.path);

    switch (file.type) {
      case "directory":
        await createDirectory(fullPath, new Date(file.updatedAt));
        break;
      default:
        await createFile(fullPath, projectId, file);
        break;
    }
  }
}

async function createDirectory(path: string, updatedAt: Date): Promise<void> {
  // Recursively create dir and update utime
  await ensureDir(path);
  await Deno.utime(path, updatedAt, updatedAt);
}

async function createFile(
  rootPath: string,
  projectId: string,
  file: Valtown.Projects.FileListResponse,
): Promise<void> {
  // Determine the extension for the file type. Affix .{E|H|C|S}.tsx to vals.
  const extension = file.type === "file" ? "" : FILE_TYPE_EXTENSIONS[file.type];

  // Build the full path with the extension
  const fullPath = join(dirname(rootPath), file.name + extension);

  // Ensure the directory exists
  await ensureDir(dirname(fullPath));

  // Fetch the file content
  const content = await valtown.projects.files.content(
    projectId,
    encodeURIComponent(file.path),
  ) as string;

  // Write the content to the file and update utime
  const updatedAt = new Date(file.updatedAt);
  await Deno.writeTextFile(fullPath, content);
  await Deno.utime(fullPath, updatedAt, updatedAt);
}
