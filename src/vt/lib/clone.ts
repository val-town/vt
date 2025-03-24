import sdk, { listProjectItems } from "~/sdk.ts";
import type Valtown from "@valtown/sdk";
import { shouldIgnore } from "~/vt/lib/paths.ts";
import { ensureDir } from "@std/fs";
import { doAtomically, isFileModified } from "~/vt/lib/utils.ts";
import {
  emptyFileStateChanges,
  type FileStateChanges,
  type FileStatus,
} from "~/vt/lib/pending.ts";
import type { ProjectItemType } from "~/consts.ts";
import { dirname } from "@std/path/dirname";
import { join } from "@std/path";

/**
 * Clones a project by downloading its files and directories to the specified
 * target directory.
 *
 * @param {object} args
 * @param {string} args.targetDir - The directory where the project will be cloned
 * @param {string} args.projectId - The uuid of the project to be cloned
 * @param {string} [args.branchId] - The branch ID to clone.
 * @param {number} [args.version] - The version of the project to clone.
 * @param {string[]} [args.gitignoreRules] - List of glob patterns for files to ignore
 * @param {boolean} [args.dryRun] - If true, don't actually write files, just report what would change
 */
export function clone({
  targetDir,
  projectId,
  branchId,
  version,
  gitignoreRules,
  dryRun = false,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  version: number;
  gitignoreRules?: string[];
  dryRun?: boolean;
}): Promise<FileStateChanges> {
  return doAtomically(
    async (tmpDir) => {
      const changes = emptyFileStateChanges();
      const projectItems = await listProjectItems(projectId, {
        version,
        branch_id: branchId,
        path: "",
      });

      await Promise.all(projectItems
        .map(async (file) => {
          // Skip ignored files
          if (shouldIgnore(file.path, gitignoreRules)) return;

          if (file.type === "directory") {
            // Create directories, even if they would otherwise get created during
            // the createFile call later, so that we get empty directories
            if (!dryRun) {
              await ensureDir(join(tmpDir, file.path));
            }
          } else {
            // Start a create file task in the background
            await createFile(
              file.path,
              targetDir,
              tmpDir,
              projectId,
              branchId,
              version,
              file,
              changes,
              dryRun,
            );
          }
        }));

      return changes;
    },
    targetDir,
    "vt_clone_",
  );
}

async function createFile(
  path: string,
  originalRoot: string,
  targetRoot: string,
  projectId: string,
  branchId: string,
  version: number,
  file: Valtown.Projects.FileRetrieveResponse.Data,
  changes: FileStateChanges,
  dryRun: boolean,
): Promise<void> {
  // Add all needed parents for creating the file
  if (!dryRun) await ensureDir(join(targetRoot, dirname(path)));

  const updatedAt = new Date(file.updatedAt);
  const fileStatus: FileStatus = {
    mtime: updatedAt.getTime(),
    type: file.type as ProjectItemType,
    path: file.path,
    status: "created", // Default status, may change below
  };

  // Check if file exists
  const fileInfo = await Deno.stat(join(originalRoot, path)).catch(() => null);
  if (fileInfo && fileInfo.mtime) {
    const localMtime = fileInfo.mtime.getTime();
    const projectMtime = updatedAt.getTime();

    // Check if the file is modified using the imported function
    const modified = await isFileModified({
      path: file.path,
      targetDir: originalRoot,
      originalPath: path,
      projectId,
      branchId,
      version,
      localMtime,
      projectMtime,
    });

    if (!modified) {
      // File exists and is not modified
      fileStatus.status = "not_modified";
      changes.not_modified.push(fileStatus);
      await ensureDir(join(targetRoot, dirname(path))); // Ensure the directory exists
      await Deno.copyFile(join(originalRoot, path), join(targetRoot, path));
      return;
    } else {
      fileStatus.status = "modified";
      changes.modified.push(fileStatus);
    }
  } else {
    changes.created.push(fileStatus);
  }

  if (dryRun) {
    return; // Don't actually modify files in dry run mode
  }

  // Get and write the file content
  await sdk.projects.files.getContent(
    projectId,
    { path: file.path, branch_id: branchId, version },
  )
    .then((resp) => resp.text())
    .then((content) => Deno.writeTextFile(join(targetRoot, path), content));

  // Set the file's mtime right after creating it
  await Deno.utime(join(targetRoot, path), updatedAt, updatedAt);
}
