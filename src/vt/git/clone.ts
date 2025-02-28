import { globToRegExp } from "@std/path/glob-to-regexp";
import { dirname, join } from "jsr:@std/path";
import { ensureDir } from "jsr:@std/fs";
import sdk, { defaultBranchId } from "~/sdk.ts";
import type Valtown from "@valtown/sdk";
import { withValExtension } from "~/vt/git/paths.ts";
import { removeEmptyDirs } from "~/utils.ts";

/**
 * Clones a project by downloading its files and directories to the specified
 * target directory.
 *
 * @param {object} args
 * @param {string} args.targetDir The directory where the project will be cloned
 * @param {string} args.projectId The unique identifier of the project to be cloned
 * @param {string?} args.branchId (optional) The branch ID of the project to clone. Defaults to the default branch not provided
 * @param {number} args.version (optional) The version of the project to clone. If not specified, the latest versio used
 * @param {string[]} args.ignoreGlobs (optional) List of glob patterns for files to ignore
 * @param {string[]} args.filterFiles (optional) List of files to include, ignoring all others
 */
export async function clone(
  {
    targetDir,
    projectId,
    branchId,
    version,
    ignoreGlobs,
    filterFiles,
  }: {
    targetDir: string;
    projectId: string;
    branchId: string;
    version: number;
    ignoreGlobs?: string[];
    filterFiles?: string[];
  },
): Promise<void> {
  const resolvedBranchId = branchId || await defaultBranchId(projectId);
  const ignorePatterns = (ignoreGlobs || []).map((glob) => globToRegExp(glob));
  const files = await sdk.projects.files
    .list(projectId, { recursive: true, branch_id: resolvedBranchId, version });

  // Create project directory if it doesn't exist, otherwise noop
  await ensureDir(targetDir);

  // Process all files and directories
  for (const file of files.data) {
    // Skip if we have a filter list and this file is not in it
    if (filterFiles && !filterFiles.includes(file.path)) {
      continue;
    }

    // Skip if the file matches any ignore pattern
    if (ignorePatterns.some((pattern) => pattern.test(file.path))) continue;

    const fullPath = join(targetDir, file.path);
    if (file.type === "directory") {
      await createDirectory(fullPath);
    } else {
      await createFile(fullPath, projectId, file);
    }
  }

  removeEmptyDirs(targetDir);
}

async function createDirectory(path: string): Promise<void> {
  await ensureDir(path);
}

async function createFile(
  rootPath: string,
  projectId: string,
  file: Valtown.Projects.FileListResponse,
): Promise<void> {
  const fullPath = join(
    dirname(rootPath),
    file.type === "file" ? file.name : withValExtension(file.name, file.type),
  );

  await ensureDir(dirname(fullPath));

  const content = await sdk.projects.files.content(
    projectId,
    encodeURIComponent(file.path),
  ) as string;

  await Deno.writeTextFile(fullPath, content);

  // Set the file's mtime right after creating it
  const updatedAt = new Date(file.updatedAt);
  await Deno.utime(fullPath, updatedAt, updatedAt);
}
