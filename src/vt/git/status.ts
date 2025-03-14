import sdk from "~/sdk.ts";
import type ValTown from "@valtown/sdk";
import { shouldIgnore } from "~/vt/git/paths.ts";
import * as fs from "@std/fs";
import * as path from "@std/path";

const STAT_PROMISES_BATCH_SIZE = 50;

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
  for (const [baseName, { originalPath, modTime }] of localFiles.entries()) {
    if (!baseName) continue; // Skip empty paths

    const projectModTime = projectFiles.get(originalPath);

    if (projectModTime === undefined) {
      // File exists locally but not in project - it's created
      result.created.push({
        path: originalPath,
        status: "created",
      });
    } else {
      // File exists in both places, so check if modified
      if (modTime > projectModTime) {
        // To make sure it is actually modified we have to actually check the
        // content delta :(. The mtime is a heuristic.
        const isModified = await isFileModified(
          targetDir,
          originalPath,
          baseName,
          projectId,
          branchId,
          version,
        );

        if (isModified) {
          result.modified.push({
            path: originalPath,
            status: "modified",
          });
        }
      } else {
        result.not_modified.push({
          path: originalPath,
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
): Promise<boolean> {
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
): Promise<Map<string, { originalPath: string; modTime: number }>> {
  const files = new Map<string, { originalPath: string; modTime: number }>();
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

    // Store both the cleaned path and original path. We'll want access to
    // the original (real) path for later when we're accessing mtimes.
    files.set(path.relative(targetDir, entry.path), {
      originalPath: relativePath,
      modTime: stat.mtime.getTime(),
    });
  };

  for await (const entry of fs.walk(targetDir)) {
    statPromises.push(processEntry(entry));

    // Process stats in batches of 50
    if (statPromises.length >= STAT_PROMISES_BATCH_SIZE) {
      await Promise.all(statPromises);
      statPromises.length = 0;
    }
  }

  await Promise.all(statPromises);

  return files;
}
