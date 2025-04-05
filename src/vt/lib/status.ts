import { listProjectItems } from "~/sdk.ts";
import { getProjectItemType, shouldIgnore } from "~/vt/lib/paths.ts";
import * as fs from "@std/fs";
import * as path from "@std/path";
import { isFileModified } from "~/vt/lib/utils.ts";
import {
  type CreatedItemStatus,
  type DeletedItemStatus,
  ItemStatusManager,
  type ModifiedItemStatus,
  type NotModifiedItemStatus,
} from "~/vt/lib/ItemStatusManager.ts";
import type ValTown from "@valtown/sdk";
import type { ProjectItemType } from "~/types.ts";

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
  version?: number;
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
export async function status(
  params: StatusParams,
): Promise<ItemStatusManager> {
  const { targetDir, projectId, branchId, version, gitignoreRules } = params;
  const result = ItemStatusManager.empty();

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
  for (const [filePath, localFileType] of localFiles.entries()) {
    const projectFileInfo = projectFiles.get(filePath);

    if (projectFileInfo === undefined) {
      // File exists locally but not in project - it's created
      const createdFileState: CreatedItemStatus = {
        status: "created",
        type: localFileType,
        path: filePath,
      };
      result.insert(createdFileState);
    } else {
      if (localFileType !== "directory") {
        // File exists in both places, check if modified
        const isModified = await isFileModified({
          path: filePath,
          targetDir,
          originalPath: filePath,
          projectId,
          branchId,
          version,
          localMtime: (await Deno.stat(path.join(targetDir, filePath))).mtime!
            .getTime(),
          projectMtime: new Date(projectFileInfo.updatedAt).getTime(),
        });

        if (isModified) {
          const modifiedFileState: ModifiedItemStatus = {
            type: localFileType,
            path: filePath,
            status: "modified",
          };
          result.insert(modifiedFileState);
        } else {
          const notModifiedFileState: NotModifiedItemStatus = {
            type: localFileType,
            path: filePath,
            status: "not_modified",
          };
          result.insert(notModifiedFileState);
        }
      } else {
        const notModifiedFileState: NotModifiedItemStatus = {
          type: localFileType,
          path: filePath,
          status: "not_modified",
        };
        result.insert(notModifiedFileState);
      }
    }
  }

  // Check for files that exist in project but not locally
  for (const [projectPath, projectFileInfo] of projectFiles.entries()) {
    if (!localFiles.has(projectPath)) {
      const deletedFileState: DeletedItemStatus = {
        type: projectFileInfo.type,
        path: projectPath,
        status: "deleted",
      };
      result.insert(deletedFileState);
    }
  }

  return result;
}

interface GetProjectFilesParams {
  projectId: string;
  branchId: string;
  version?: number;
  gitignoreRules?: string[];
}

async function getProjectFiles({
  projectId,
  branchId,
  version = undefined,
  gitignoreRules,
}: GetProjectFilesParams): Promise<
  Map<string, ValTown.Projects.FileRetrieveResponse>
> {
  const projectItems = (await listProjectItems(projectId, {
    path: "",
    branch_id: branchId,
    version,
    recursive: true,
  }))
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
  version?: number;
  targetDir: string;
  gitignoreRules?: string[];
}

async function getLocalFiles({
  projectId,
  branchId,
  version = undefined,
  targetDir,
  gitignoreRules,
}: GetLocalFilesParams): Promise<Map<string, ProjectItemType>> {
  const files = new Map<string, ProjectItemType>();
  const statPromises: Promise<void>[] = [];

  const processEntry = async (entry: fs.WalkEntry) => {
    // Check if this is on the ignore list
    const relativePath = path.relative(targetDir, entry.path);
    if (shouldIgnore(relativePath, gitignoreRules)) return;
    if (entry.path === targetDir) return;

    // Store the path and its modification time
    files.set(
      relativePath,
      entry.isDirectory ? "directory" : await getProjectItemType(projectId, {
        branchId: branchId,
        version,
        filePath: relativePath,
      }),
    );
  };

  for await (const entry of fs.walk(targetDir)) {
    statPromises.push(processEntry(entry));
  }

  await Promise.all(statPromises);

  return files;
}
