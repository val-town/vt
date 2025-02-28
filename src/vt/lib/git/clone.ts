// Import necessary modules
import { dirname, join } from "jsr:@std/path";
import { ensureDir } from "jsr:@std/fs";
import sdk, { defaultBranchId } from "~/sdk.ts";
import type Valtown from "@valtown/sdk";

// Define file type extensions
const FILE_TYPE_EXTENSIONS: Record<string, string> = {
  "script": ".S.tsx",
  "http": ".H.tsx",
  "email": ".E.tsx",
  "interval": ".C.tsx",
};

interface CloneOptions {
  targetDir: string;
  projectId: string;
  branchId?: string;
  version?: number;
}

/**
 * Clones a project by downloading its files and directories to the specified
 * target directory.
 *
 * @param config - Configuration options for cloning the project
 */
export async function clone(config: CloneOptions): Promise<void> {
  const { targetDir, projectId, branchId, version } = config;

  const resolvedBranchId = branchId || await defaultBranchId(projectId);

  // Get all files in project recursively
  const files = await sdk.projects.files
    .list(projectId, { recursive: true, branch_id: resolvedBranchId, version });

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

/**
 * Creates a directory at the specified path and updates its modification time.
 *
 * @param path - The path of the directory to create
 * @param updatedAt - The date to set as the directory's modification time
 */
async function createDirectory(path: string, updatedAt: Date): Promise<void> {
  await ensureDir(path);
  await Deno.utime(path, updatedAt, updatedAt);
}

/**
 * Creates a file with the specified content and updates its modification time.
 *
 * @param rootPath - The base path where the file will be created
 * @param projectId - The ID of the project to which the file belongs
 * @param file - The file metadata from the project
 */
async function createFile(
  rootPath: string,
  projectId: string,
  file: Valtown.Projects.FileListResponse,
): Promise<void> {
  const extension = file.type === "file" ? "" : FILE_TYPE_EXTENSIONS[file.type];
  const fullPath = join(dirname(rootPath), file.name + extension);

  await ensureDir(dirname(fullPath));

  const content = await sdk.projects.files.content(
    projectId,
    encodeURIComponent(file.path),
  ) as string;

  const updatedAt = new Date(file.updatedAt);
  await Deno.writeTextFile(fullPath, content);
  await Deno.utime(fullPath, updatedAt, updatedAt);
}
