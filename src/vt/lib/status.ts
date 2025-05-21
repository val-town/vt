import { getValItemContent, listValItems } from "~/sdk.ts";
import { getValItemType, shouldIgnore } from "~/vt/lib/paths.ts";
import * as fs from "@std/fs";
import * as path from "@std/path";
import {
  type CreatedItemStatus,
  type DeletedItemStatus,
  getItemWarnings,
  type ItemInfo,
  ItemStatusManager,
  type ModifiedItemStatus,
  type NotModifiedItemStatus,
} from "~/vt/lib/utils/ItemStatusManager.ts";
import { join } from "@std/path";
import { isFileModified } from "~/vt/lib/utils/misc.ts";
import { exists } from "@std/fs";

/** Result of status operation  */
export interface StatusResult {
  itemStateChanges: ItemStatusManager;
}

/**
 * Parameters for scanning a directory and determining the status of files compared to the Val Town val.
 */
export interface StatusParams {
  /** The directory to scan for changes. */
  targetDir: string;
  /** The Val Town Val ID. */
  valId: string;
  /** Branch ID to check against. */
  branchId: string;
  /** The version to check the status against. Defaults to the latest version. */
  version: number;
  /** Gitignore rules */
  gitignoreRules?: string[];
}

/**
 * Scans a directory and determines the status of all files compared to the Val
 * Town Val on the website. Reports status for files as modified, not
 * modified, deleted, or created.
 *
 * @param params Options for status operation.
 * @returns Promise that resolves to a FileState object containing categorized files.
 */
export async function status(params: StatusParams): Promise<StatusResult> {
  const {
    targetDir,
    valId,
    branchId,
    version,
    gitignoreRules,
  } = params;
  const result = new ItemStatusManager();

  const localFiles = await getLocalFiles({
    valId,
    branchId,
    version,
    targetDir,
    gitignoreRules,
  });
  const valFiles = await getValFiles({
    valId,
    branchId,
    version,
    gitignoreRules,
    targetDir,
  });
  const valFileMap = new Map(valFiles.map((file) => [file.path, file]));

  // Compare local files against Val files
  for (const localFile of localFiles) {
    const valFileInfo = valFileMap.get(localFile.path);
    const localFilePath = join(targetDir, localFile.path);

    if (valFileInfo === undefined) {
      // File exists locally but not in Val - it's created
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
          localContent: localFile.content!, // We know it isn't a dir, so there should be content
          localMtime: localFile.mtime,
          remoteContent: valFileInfo.content!,
          remoteMtime: valFileInfo.mtime,
        });

        if (isModified) {
          const modifiedFileState: ModifiedItemStatus = {
            type: localFile.type,
            path: localFile.path,
            status: "modified",
            where: localStat.mtime!.getTime() > valFileInfo.mtime
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

  // Check for files that exist in Val but not locally
  for (const valFile of valFiles) {
    if (!localFiles.find((f) => f.path === valFile.path)) {
      const deletedFileState: DeletedItemStatus = {
        type: valFile.type,
        path: valFile.path,
        status: "deleted",
        mtime: valFile.mtime,
        content: valFile.content,
      };
      result.insert(deletedFileState);
    }
  }

  return { itemStateChanges: result.consolidateRenames() };
}

async function getValFiles({
  valId,
  branchId,
  version,
  gitignoreRules,
  targetDir,
}: {
  valId: string;
  branchId: string;
  version: number;
  gitignoreRules?: string[];
  targetDir: string;
}): Promise<ItemInfo[]> {
  return Promise.all(
    (await listValItems(valId, branchId, version))
      .filter((file) => !shouldIgnore(file.path, gitignoreRules))
      .map(async (file): Promise<ItemInfo> => {
        let itemContent: string | undefined;

        const localFileMTime = await exists(join(targetDir, file.path))
          ? (await Deno
            .stat(join(targetDir, file.path))
            .then((stat) => !stat.isDirectory && stat.mtime!.getTime()))
          : undefined;
        const remoteFileMTime = new Date(file.updatedAt).getTime();

        const definitelyIsNotModified = file.type === "directory" ||
          localFileMTime === remoteFileMTime;

        if (definitelyIsNotModified && file.type !== "directory") {
          // If the file is not modified, we can fetch its content from the local copy
          itemContent = await Deno.readTextFile(join(targetDir, file.path));
        } else if (file.type !== "directory") {
          // If the file is modified, we need to fetch its content from Val
          itemContent = await getValItemContent(
            valId,
            branchId,
            version,
            file.path,
          );
        }

        return ({
          path: file.path,
          type: file.type,
          mtime: new Date(file.updatedAt).getTime(),
          content: itemContent,
        });
      }),
  );
}

async function getLocalFiles({
  valId,
  branchId,
  version,
  targetDir,
  gitignoreRules,
}: {
  valId: string;
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

      const localStat = await Deno.stat(entry.path);

      const fileContent = await Deno.readTextFile(entry.path)
        .catch((_e) => undefined);

      return {
        path: relativePath,
        type: (entry.isDirectory ? "directory" : await getValItemType(
          valId,
          branchId,
          version,
          relativePath,
        )),
        mtime: localStat.mtime!.getTime(),
        content: entry.isDirectory ? undefined : fileContent,
      };
    })());
  }

  // Wait for all promises to resolve and filter out nulls
  const results = await Promise.all(filePromises);
  return results.filter((item): item is ItemInfo => item !== null);
}
