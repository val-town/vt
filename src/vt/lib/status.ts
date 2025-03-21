import sdk, { listProjectItems } from "~/sdk.ts";
import { getProjectItemType, shouldIgnore } from "~/vt/lib/paths.ts";
import * as fs from "@std/fs";
import * as path from "@std/path";
import type { ProjectItemType } from "~/consts.ts";

interface FileInfo {
  mtime: number;
  type: ProjectItemType;
}

export interface FileStatus extends FileInfo {
  status: "modified" | "not_modified" | "deleted" | "created";
  path: string;
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
 * @param {string} args.gitignoreRules - Gitignore rules
 *
 * @returns Promise that resolves to a StatusResult object containing categorized files.
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
  version: number;
  gitignoreRules: string[];
}): Promise<StatusResult> {
  const result: StatusResult = {
    modified: [],
    not_modified: [],
    deleted: [],
    created: [],
  };

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
    if (!filePath) continue; // Skip empty paths

    const projectFileInfo = projectFiles.get(filePath);

    if (projectFileInfo === undefined) {
      // File exists locally but not in project - it's created
      result.created.push({
        type: localFileInfo.type,
        path: filePath,
        mtime: localFileInfo.mtime,
        status: "created",
      });
    } else {
      if (localFileInfo.type !== "directory") {
        // File exists in both places, check if modified
        const isModified = await isFileModified(
          targetDir,
          filePath,
          filePath,
          projectId,
          branchId,
          version,
          localFileInfo.mtime,
          projectFileInfo.mtime,
        );

        if (isModified) {
          result.modified.push({
            type: localFileInfo.type,
            path: filePath,
            mtime: localFileInfo.mtime,
            status: "modified",
          });
        }
      } else {
        result.not_modified.push({
          type: localFileInfo.type,
          path: filePath,
          mtime: localFileInfo.mtime,
          status: "not_modified",
        });
      }
    }
  }

  // Check for files that exist in project but not locally
  for (const [projectPath, projectFileInfo] of projectFiles.entries()) {
    if (!localFiles.has(projectPath)) {
      result.deleted.push({
        type: projectFileInfo.type,
        path: projectPath,
        mtime: projectFileInfo.mtime,
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
    {
      path: cleanPath,
      branch_id: branchId,
      version,
    },
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
  gitignoreRules: string[],
): Promise<Map<string, FileInfo>> {
  const projectItems = await listProjectItems(projectId, {
    path: "",
    branch_id: branchId,
    version,
  });

  const filesMap = new Map<string, FileInfo>();

  for (const file of projectItems) {
    if (!(await shouldIgnore(file.path, gitignoreRules))) {
      const filePath = path.join(path.dirname(file.path), file.name);
      filesMap.set(filePath, {
        mtime: new Date(file.updatedAt).getTime(),
        type: file.type,
      });
    }
  }

  return filesMap;
}

async function getLocalFiles(
  projectId: string,
  branchId: string,
  version: number,
  targetDir: string,
  gitignoreRules: string[],
): Promise<Map<string, FileInfo>> {
  const files = new Map<string, FileInfo>();
  const statPromises: Promise<void>[] = [];

  const processEntry = async (entry: fs.WalkEntry) => {
    // Check if this is on the ignore list
    const relativePath = path.relative(targetDir, entry.path);
    if (
      await shouldIgnore(relativePath, gitignoreRules, targetDir)
    ) return;

    // Stat the file to get the modification time
    const stat = await Deno.stat(entry.path);
    if (stat.mtime === null) {
      throw new Error("File modification time is null");
    }

    // Store the path and its modification time
    files.set(path.relative(targetDir, entry.path), {
      type: entry.isDirectory ? "directory" : await getProjectItemType(
        projectId,
        branchId,
        version,
        relativePath,
      ),
      mtime: stat.mtime.getTime(),
    });
  };

  for await (const entry of fs.walk(targetDir)) {
    statPromises.push(processEntry(entry));
  }

  await Promise.all(statPromises);

  return files;
}
