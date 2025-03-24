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

/**
 * Scans a directory and determines the status of all files compared to the Val
 * Town project on the website. Reports status for files as modified, not
 * modified, deleted, or created.
 *
 * @param args Options for status operation.
 * @param {string} args.targetDir - The directory to scan for changes.
 * @param {string} args.projectId - The Val Town project ID.
 * @param {string} args.branchId - Optional branch ID to check against.
 * @param [string] args.version - The version to check the status against. Defaults to the latest version.
 * @param [string] args.gitignoreRules - Gitignore rules
 *
 * @returns Promise that resolves to a FileState object containing categorized files.
 */
export async function status({
  targetDir,
  projectId,
  branchId,
  version,
  gitignoreRules,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  version?: number;
  gitignoreRules?: string[];
}): Promise<FileState> {
  const result = FileState.empty();

  // Get all files
  const localFiles = await getLocalFiles(
    projectId,
    branchId,
    version,
    targetDir,
    gitignoreRules,
  );
  const projectFiles = await getProjectFiles(
    projectId,
    branchId,
    version,
    gitignoreRules,
  );

  // Compare local files against project files
  for (const [filePath, localFileInfo] of localFiles.entries()) {
    const projectFileInfo = projectFiles.get(filePath);

    if (projectFileInfo === undefined) {
      // File exists locally but not in project - it's created
      result.insert({
        type: localFileInfo.type,
        path: filePath,
        mtime: localFileInfo.mtime,
        status: "created",
      });
    } else {
      if (localFileInfo.type !== "directory") {
        // File exists in both places, check if modified
        const isModified = await isFileModified({
          path: filePath,
          targetDir,
          originalPath: filePath,
          projectId,
          branchId,
          version,
          localMtime: localFileInfo.mtime,
          projectMtime: projectFileInfo.mtime,
        });

        if (isModified) {
          const fileStatus: FileStatus = {
            type: localFileInfo.type,
            path: filePath,
            mtime: localFileInfo.mtime,
            status: "modified",
          };
          result.insert(fileStatus);
        } else {
          const fileStatus: FileStatus = {
            type: localFileInfo.type,
            path: filePath,
            mtime: localFileInfo.mtime,
            status: "not_modified",
          };
          result.insert(fileStatus);
        }
      } else {
        const fileStatus: FileStatus = {
          type: localFileInfo.type,
          path: filePath,
          mtime: localFileInfo.mtime,
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
        mtime: projectFileInfo.mtime,
        status: "deleted",
      });
    }
  }

  return result;
}

async function getProjectFiles(
  projectId: string,
  branchId: string,
  version: number | undefined = undefined,
  gitignoreRules?: string[],
): Promise<Map<string, FileInfo>> {
  const projectItems = (await listProjectItems(projectId, {
    path: "",
    branch_id: branchId,
    version,
    recursive: true,
  }))
    .filter((file) => !shouldIgnore(file.path, gitignoreRules))
    .map((file): [string, FileInfo] => [
      file.path,
      { mtime: new Date(file.updatedAt).getTime(), type: file.type },
    ]);

  return new Map<string, FileInfo>(projectItems);
}

async function getLocalFiles(
  projectId: string,
  branchId: string,
  version: number | undefined = undefined,
  targetDir: string,
  gitignoreRules?: string[],
): Promise<Map<string, FileInfo>> {
  const files = new Map<string, FileInfo>();
  const statPromises: Promise<void>[] = [];

  const processEntry = async (entry: fs.WalkEntry) => {
    // Check if this is on the ignore list
    const relativePath = path.relative(targetDir, entry.path);
    if (shouldIgnore(relativePath, gitignoreRules)) return;
    if (entry.path === targetDir) return;

    // Stat the file to get the modification time
    const stat = await Deno.stat(entry.path);

    // Store the path and its modification time
    files.set(path.relative(targetDir, entry.path), {
      type: entry.isDirectory ? "directory" : await getProjectItemType(
        projectId,
        branchId,
        version,
        relativePath,
      ),
      mtime: stat.mtime!.getTime(),
    });
  };

  for await (const entry of fs.walk(targetDir)) {
    statPromises.push(processEntry(entry));
  }

  await Promise.all(statPromises);

  return files;
}
