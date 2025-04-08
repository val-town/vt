import { listProjectItems } from "~/sdk.ts";
import { getProjectItemType, shouldIgnore } from "~/vt/lib/paths.ts";
import * as fs from "@std/fs";
import * as path from "@std/path";
import { isFileModified } from "~/vt/lib/utils.ts";
import {
  type FileInfo,
  FileState,
  type FileStatus,
} from "~/vt/lib/FileState.ts";
import type ValTown from "@valtown/sdk";

/**
 * Parameters for scanning a directory and determining the status of files compared to the Val Town project.
 */
export interface StatusParams {
  /** The directory to scan for changes. */
  targetDir: string;
  /** The Val Town project ID. */
  projectId: string;
  /** Branch ID to check against. */
  branchId: string;
  /** The version to check the status against. Defaults to the latest version. */
  version: number;
  /** Gitignore rules */
  gitignoreRules?: string[];
}

/**
 * Scans a directory and determines the status of all files compared to the Val
 * Town project on the website. Reports status for files as modified, not
 * modified, deleted, or created.
 *
 * @param params Options for status operation.
 * @returns Promise that resolves to a FileState object containing categorized files.
 */
export async function status(params: StatusParams): Promise<FileState> {
  const { targetDir, projectId, branchId, version, gitignoreRules } = params;
  const result = FileState.empty();

  // Get all files
  const localFiles = await getLocalFiles({
    projectId,
    branchId,
    version,
    targetDir,
    gitignoreRules,
  });
  const projectFiles = await getProjectFiles({
    projectId,
    branchId,
    version,
    gitignoreRules,
  });

  // Compare local files against project files
  for (const [filePath, localFileInfo] of localFiles.entries()) {
    const projectFileInfo = projectFiles.get(filePath);

    if (projectFileInfo === undefined) {
      // File exists locally but not in project - it's created
      result.insert({
        type: localFileInfo.type,
        path: filePath,
        status: "created",
      });
    } else {
      if (localFileInfo.type !== "directory") {
        const localMtime = (await Deno.stat(path.join(targetDir, filePath)))
          .mtime!.getTime();
        const projectMtime = new Date(projectFileInfo.updatedAt).getTime();

        // File exists in both places, check if modified
        const isModified = await isFileModified({
          path: filePath,
          targetDir,
          originalPath: filePath,
          projectId,
          branchId,
          version,
          localMtime,
          projectMtime,
        });

        if (isModified) {
          const fileStatus: FileStatus = {
            type: localFileInfo.type,
            path: filePath,
            status: "modified",
            where: projectMtime > localMtime ? "remote" : "local",
          };
          result.insert(fileStatus);
        } else {
          const fileStatus: FileStatus = {
            type: localFileInfo.type,
            path: filePath,
            status: "not_modified",
          };
          result.insert(fileStatus);
        }
      } else {
        const fileStatus: FileStatus = {
          type: localFileInfo.type,
          path: filePath,
          status: "not_modified",
        };
        result.insert(fileStatus);
      }
    }
  }

  // Check for files that exist in project but not locally
  for (const [projectPath, projectFileInfo] of projectFiles.entries()) {
    if (!localFiles.has(projectPath)) {
      result.insert({
        type: projectFileInfo.type,
        path: projectPath,
        status: "deleted",
      });
    }
  }

  return result;
}

interface GetProjectFilesParams {
  projectId: string;
  branchId: string;
  version: number;
  gitignoreRules?: string[];
}

async function getProjectFiles({
  projectId,
  branchId,
  version,
  gitignoreRules,
}: GetProjectFilesParams): Promise<
  Map<string, ValTown.Projects.FileRetrieveResponse>
> {
  const projectItems = (await listProjectItems(projectId, branchId, version))
    .filter((file) => !shouldIgnore(file.path, gitignoreRules))
    .map((
      file,
    ): [string, ValTown.Projects.FileRetrieveResponse] => [
      file.path,
      file,
    ]);

  return new Map<string, ValTown.Projects.FileRetrieveResponse>(projectItems);
}

interface GetLocalFilesParams {
  projectId: string;
  branchId: string;
  version: number;
  targetDir: string;
  gitignoreRules?: string[];
}

async function getLocalFiles({
  projectId,
  branchId,
  version,
  targetDir,
  gitignoreRules,
}: GetLocalFilesParams): Promise<Map<string, FileInfo>> {
  const files = new Map<string, FileInfo>();
  const statPromises: Promise<void>[] = [];

  const processEntry = async (entry: fs.WalkEntry) => {
    // Check if this is on the ignore list
    const relativePath = path.relative(targetDir, entry.path);
    if (shouldIgnore(relativePath, gitignoreRules)) return;
    if (entry.path === targetDir) return;

    // Store the path and its modification time
    files.set(path.relative(targetDir, entry.path), {
      type: entry.isDirectory
        ? "directory"
        : await getProjectItemType(projectId, {
          branchId,
          version,
          filePath: relativePath,
        }),
    });
  };

  for await (const entry of fs.walk(targetDir)) {
    statPromises.push(processEntry(entry));
  }

  await Promise.all(statPromises);

  return files;
}
