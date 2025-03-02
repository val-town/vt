import sdk from "~/sdk.ts";
import type Valtown from "@valtown/sdk";
import { withValExtension } from "~/vt/git/paths.ts";
import { removeEmptyDirs } from "~/utils.ts";
import { shouldIgnoreGlob } from "~/vt/git/paths.ts";
import * as path from "@std/path";
import { ensureDir } from "@std/fs";

/**
 * Clones a project by downloading its files and directories to the specified
 * target directory.
 *
 * @param {object} args
 * @param {string} args.targetDir The directory where the project will be cloned
 * @param {string} args.projectId The uuid of the project to be cloned
 * @param {string} args.branchId (optional) The branch ID to clone.
 * @param {number} args.version (optional) The version of the project to clone.
 * @param {string[]} args.ignoreGlobs (optional) List of glob patterns for files to ignore
 */
export async function clone(
  {
    targetDir,
    projectId,
    branchId,
    version,
    ignoreGlobs,
  }: {
    targetDir: string;
    projectId: string;
    branchId: string;
    version: number;
    ignoreGlobs?: string[];
  },
): Promise<void> {
  const files = await sdk.projects.files
    .list(projectId, { recursive: true, branch_id: branchId, version });

  // Create project directory if it doesn't exist, otherwise noop
  await ensureDir(targetDir);

  // Process all files and directories. We call forAllIgnored with the function
  // we want to run on each file (which will only apply our function to non
  // ignored files). Then we run it on all the files.
  files.data
    .filter((file) => file.type !== "directory") // we'll create directories when creating files
    .filter((file) => !shouldIgnoreGlob(file.path, ignoreGlobs))
    .forEach(
      // Function to run on files (if they aren't ignored)
      async (file: Valtown.Projects.FileListResponse) => {
        const fullPath = path.join(targetDir, file.path);
        await createFile(fullPath, projectId, file);
      },
    );

  removeEmptyDirs(targetDir);
}

async function createFile(
  rootPath: string,
  projectId: string,
  file: Valtown.Projects.FileListResponse,
): Promise<void> {
  // Skip if file doesn't have a proper path
  if (!file.path) {
    console.warn(`Skipping file with missing path: ${file.name}`);
    return;
  }

  const fullPath = path.join(
    path.dirname(rootPath),
    file.type === "file" ? file.name : withValExtension(file.name, file.type),
  );

  // Add all needed parents for creating the file
  await ensureDir(path.dirname(fullPath));

  // Get and write the file content
  const content = await sdk.projects.files.content(
    projectId,
    encodeURIComponent(file.path),
  ) as string;

  await ensureDir(path.dirname(fullPath));
  await Deno.writeTextFile(fullPath, content);

  // Set the file's mtime right after creating it
  const updatedAt = new Date(file.updatedAt);
  await Deno.utime(fullPath, updatedAt, updatedAt);
}
