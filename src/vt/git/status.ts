import sdk from "~/sdk.ts";
import type ValTown from "@valtown/sdk";
import { shouldIgnore } from "~/vt/git/paths.ts";
import * as fs from "@std/fs";
import * as path from "@std/path";

export interface FileStatus {
  path: string;
  status: "modified" | "not_modified" | "deleted" | "created";
}

export interface StatusResult {
  modified: FileStatus[];
  not_modified: FileStatus[];
  deleted: FileStatus[];
  created: FileStatus[];
}

/**
 * Scans a directory and determines the status of all files compared to the Val
 * Town project on the website. Reports status for files as modified, not
 * modified, deleted, or created.
 *
 * @param args Options for status operation.
 * @param {string} args.targetDir - The directory to scan for changes.
 * @param {string} args.projectId - The Val Town project ID.
 * @param {string} args.branchId - Optional branch ID to check against.
 * @param {string} args.version - The version to check the status against.
 * @param {string} args.ignoreGlobs - Glob patterns for files to ignore.
 *
 * @returns Promise that resolves to a StatusResult object containing categorized files.
 */
export async function status({
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
  ignoreGlobs: string[];
}): Promise<StatusResult> {
  const result: StatusResult = {
    modified: [],
    not_modified: [],
    deleted: [],
    created: [],
  };

  // Get all files
  const localFiles = await getLocalFiles(targetDir, ignoreGlobs);
  const projectFiles = await getProjectFiles(
    projectId,
    branchId,
    version,
    ignoreGlobs,
  );

  // Compare local files against project files
  for (const [baseName, mtime] of localFiles.entries()) {
    if (!baseName) continue; // Skip empty paths

    const projectModTime = projectFiles.get(baseName);

    if (projectModTime === undefined) {
      // File exists locally but not in project - it's created
      result.created.push({
        path: baseName,
        status: "created",
      });
    } else {
      // File exists in both places, check if modified
      const isModified = await isFileModified(
        targetDir,
        baseName,
        baseName,
        projectId,
        branchId,
        version,
        mtime,
        projectModTime,
      );

      if (isModified) {
        result.modified.push({
          path: baseName,
          status: "modified",
        });
      } else {
        result.not_modified.push({
          path: baseName,
          status: "not_modified",
        });
      }
    }
  }

  // Check for files that exist in project but not locally
  for (const [projectPath, _] of projectFiles.entries()) {
    if (!localFiles.has(projectPath)) {
      result.deleted.push({
        path: projectPath,
        status: "deleted",
      });
    }
  }

  return result;
}

async function isFileModified(
  targetDir: string,
  originalPath: string,
  cleanPath: string,
  projectId: string,
  branchId: string,
  version: number,
  localMtime: number,
  projectMtime: number,
): Promise<boolean> {
  // First use the mtime as a heuristic to avoid unnecessary content checks
  if (localMtime <= projectMtime) {
    return false;
  }

  // If mtime indicates a possible change, check content
  const projectFileContent = await sdk.projects.files.getContent(
    projectId,
    encodeURIComponent(cleanPath),
    { branch_id: branchId, version },
  ).then((resp) => resp.text());

  // For some reason the local paths seem to have an extra newline
  const localFileContent = await Deno.readTextFile(
    path.join(targetDir, originalPath),
  );

  return projectFileContent !== localFileContent;
}

async function getProjectFiles(
  projectId: string,
  branchId: string,
  version: number,
  ignoreGlobs: string[],
): Promise<Map<string, number>> {
  const projectFilesResponse = await sdk.projects.files.list(projectId, {
    branch_id: branchId,
    version,
    recursive: true,
  });

  const files: ValTown.Projects.FileListResponse[] = [];
  for await (const file of projectFilesResponse.data) files.push(file);

  const processedFiles = files
    .filter((file) => !shouldIgnore(file.path, ignoreGlobs))
    .filter((file) => file.type !== "directory")
    .map((file: ValTown.Projects.FileListResponse) => [
      path.join(path.dirname(file.path), file.name),
      new Date(file.updatedAt).getTime(),
    ]) as [string, number][];

  return new Map(processedFiles);
}

async function getLocalFiles(
  targetDir: string,
  ignoreGlobs: string[],
): Promise<Map<string, number>> {
  const files = new Map<string, number>();
  const statPromises: Promise<void>[] = [];

  const processEntry = async (entry: fs.WalkEntry) => {
    // Skip directories, we don't track directories themselves as objects
    if (entry.isDirectory) return;

    // Check if this is on the ignore list
    const relativePath = path.relative(targetDir, entry.path);
    if (shouldIgnore(relativePath, ignoreGlobs)) return;

    // Stat the file to get the modification time
    const stat = await Deno.stat(entry.path);
    if (stat.mtime === null) {
      throw new Error("File modification time is null");
    }

    // Store the path and its modification time
    files.set(path.relative(targetDir, entry.path), stat.mtime.getTime());
  };

  for await (const entry of fs.walk(targetDir)) {
    statPromises.push(processEntry(entry));
  }

  await Promise.all(statPromises);

  return files;
}
