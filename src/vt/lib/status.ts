import sdk, { listProjectItems } from "~/sdk.ts";
import { getProjectItemType, shouldIgnore } from "~/vt/lib/paths.ts";
import * as fs from "@std/fs";
import * as path from "@std/path";
import { isFileModified } from "~/vt/lib/utils.ts";
import {
  type CreatedItemStatus,
  type DeletedItemStatus,
  getItemWarnings,
  type ItemInfo,
  ItemStatusManager,
  type ModifiedItemStatus,
  type NotModifiedItemStatus,
} from "~/vt/lib/ItemStatusManager.ts";
import { join } from "@std/path";

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
export async function status(params: StatusParams): Promise<ItemStatusManager> {
  const {
    targetDir,
    projectId,
    branchId,
    version,
    gitignoreRules,
  } = params;
  const result = new ItemStatusManager();

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
  const projectFileMap = new Map(projectFiles.map((file) => [file.path, file]));

  // Compare local files against project files
  for (const localFile of localFiles) {
    const projectFileInfo = projectFileMap.get(localFile.path);
    const localFilePath = join(targetDir, localFile.path);

    if (projectFileInfo === undefined) {
      // File exists locally but not in project - it's created
      const createdFileState: CreatedItemStatus = {
        status: "created",
        type: localFile.type,
        path: localFile.path,
        mtime: localFile.mtime,
        content: localFile.content,
        warnings: await getItemWarnings(localFilePath),
      };
      result.insert(createdFileState);
    } else {
      if (localFile.type !== "directory") {
        const localStat = await Deno.stat(path.join(targetDir, localFile.path));
        // File exists in both places, check if modified
        const isModified = isFileModified({
          srcContent: localFile.content!, // We know it isn't a dir, so there should be content
          srcMtime: localFile.mtime,
          dstContent: projectFileInfo.content!,
          dstMtime: projectFileInfo.mtime,
        });

        if (isModified) {
          const modifiedFileState: ModifiedItemStatus = {
            type: localFile.type,
            path: localFile.path,
            status: "modified",
            where: localStat.mtime!.getTime() > projectFileInfo.mtime
              ? "local"
              : "remote",
            mtime: localStat.mtime!.getTime(),
            content: localFile.content,
            warnings: await getItemWarnings(localFilePath),
          };
          result.insert(modifiedFileState);
        } else {
          const notModifiedFileState: NotModifiedItemStatus = {
            type: localFile.type,
            path: localFile.path,
            status: "not_modified",
            mtime: localStat.mtime!.getTime(),
            content: localFile.content,
          };
          result.insert(notModifiedFileState);
        }
      } else {
        const notModifiedFileState: NotModifiedItemStatus = {
          type: localFile.type,
          path: localFile.path,
          status: "not_modified",
          mtime: localFile.mtime,
          content: localFile.content,
        };
        result.insert(notModifiedFileState);
      }
    }
  }

  // Check for files that exist in project but not locally
  for (const projectFile of projectFiles) {
    if (!localFiles.find((f) => f.path === projectFile.path)) {
      const deletedFileState: DeletedItemStatus = {
        type: projectFile.type,
        path: projectFile.path,
        status: "deleted",
        mtime: projectFile.mtime,
        content: projectFile.content,
      };
      result.insert(deletedFileState);
    }
  }

  return result.consolidateRenames();
}

async function getProjectFiles({
  projectId,
  branchId,
  version,
  gitignoreRules,
}: {
  projectId: string;
  branchId: string;
  version: number;
  gitignoreRules?: string[];
}): Promise<ItemInfo[]> {
  return Promise.all(
    (await listProjectItems(projectId, branchId, version))
      .filter((file) => !shouldIgnore(file.path, gitignoreRules))
      .map(async (file): Promise<ItemInfo> => ({
        path: file.path,
        type: file.type,
        mtime: new Date(file.updatedAt).getTime(),
        content: file.type === "directory"
          ? undefined
          : await sdk.projects.files.getContent(projectId, {
            path: file.path,
            branch_id: branchId,
            version,
          }).then((resp) => resp.text()),
      })),
  );
}

async function getLocalFiles({
  projectId,
  branchId,
  version,
  targetDir,
  gitignoreRules,
}: {
  projectId: string;
  branchId: string;
  version: number;
  targetDir: string;
  gitignoreRules?: string[];
}): Promise<ItemInfo[]> {
  const filePromises: Promise<ItemInfo | null>[] = [];

  for await (const entry of fs.walk(targetDir)) {
    filePromises.push((async () => {
      // Check if this is on the ignore list
      const relativePath = path.relative(targetDir, entry.path);
      if (shouldIgnore(relativePath, gitignoreRules)) return null;
      if (entry.path === targetDir) return null;

      // Store the path and its modification time
      const localStat = await Deno.stat(entry.path);

      return {
        path: relativePath,
        type: (entry.isDirectory ? "directory" : await getProjectItemType(
          projectId,
          branchId,
          version,
          relativePath,
        )),
        mtime: localStat.mtime!.getTime(),
        content: entry.isDirectory
          ? undefined
          : await Deno.readTextFile(entry.path),
      };
    })());
  }

  // Wait for all promises to resolve and filter out nulls
  const results = await Promise.all(filePromises);
  return results.filter((item): item is ItemInfo => item !== null);
}
