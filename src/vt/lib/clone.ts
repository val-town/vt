import sdk, { listProjectItems } from "~/sdk.ts";
import { shouldIgnore } from "~/vt/lib/paths.ts";
import { ensureDir, exists } from "@std/fs";
import { doAtomically, isFileModified } from "~/vt/lib/utils.ts";
import { dirname } from "@std/path/dirname";
import { join } from "@std/path";
import type ValTown from "@valtown/sdk";
import {
  type ItemStatus,
  ItemStatusManager,
} from "~/vt/lib/ItemStatusManager.ts";

/**
 * Result of a clone operation.
 */
export interface CloneResult {
  /** Changes made to items during the cloning process */
  itemStateChanges: ItemStatusManager;
}

/**
 * Parameters for cloning a project by downloading its files and directories to the specified
 * target directory.
 */
export interface CloneParams {
  /** The directory where the project will be cloned */
  targetDir: string;
  /** The id of the project to be cloned */
  projectId: string;
  /** The branch ID of the project to clone */
  branchId: string;
  /** The version to clone. Defaults to latest */
  version: number;
  /** A list of gitignore rules. */
  gitignoreRules?: string[];
  /** If true, don't actually write files, just report what would change */
  dryRun?: boolean;
  /** If false, don't overwrite existing files. Default is true (overwrite) */
  overwrite?: boolean;
}

/**
 * Clones a project by downloading its files and directories to the specified
 * target directory.
 *
 * @param params Options for the clone operation
 * @returns Promise that resolves with changes that were applied or would be applied (if dryRun=true)
 */
export function clone(params: CloneParams): Promise<CloneResult> {
  const {
    targetDir,
    projectId,
    branchId,
    version,
    gitignoreRules,
    dryRun = false,
    overwrite = true,
  } = params;
  return doAtomically(
    async (tmpDir) => {
      const itemStateChanges = new ItemStatusManager();
      const projectItems = await listProjectItems(
        projectId,
        branchId,
        version,
      );

      await Promise.all(projectItems
        .map(async (file) => {
          // Skip ignored files
          if (shouldIgnore(file.path, gitignoreRules)) return;

          if (file.type === "directory") {
            // Create directories, even if they would otherwise get created
            // during the createFile call later, so that we get empty
            // directories
            if (dryRun === false) await ensureDir(join(tmpDir, file.path));

            // If the directory is new mark it as created
            if (!(await exists(join(targetDir, file.path)))) {
              await itemStateChanges.insert({
                type: "directory",
                path: file.path,
                status: "created",
                mtime: new Date(file.updatedAt).getTime(),
              });
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
              itemStateChanges,
              dryRun,
              overwrite,
            );
          }
        }));

      return [{ itemStateChanges }, !dryRun];
    },
    { targetDir, prefix: "vt_clone_" },
  );
}

async function createFile(
  path: string,
  originalRoot: string,
  targetRoot: string,
  projectId: string,
  branchId: string,
  version: number | undefined = undefined,
  file: ValTown.Projects.FileRetrieveResponse,
  changes: ItemStatusManager,
  dryRun: boolean,
  overwrite: boolean = true,
): Promise<void> {
  const updatedAt = new Date(file.updatedAt);
  const fileType = file.type;

  // Check for existing file and determine status
  const fileInfo = await Deno
    .stat(join(originalRoot, path))
    .catch(() => null);
  
  // Skip file if it exists and overwrite is false
  if (!overwrite && fileInfo !== null) {
    // Still add to changes with not_modified status, since we're keeping the file as-is
    const localContent = await Deno.readTextFile(join(originalRoot, path));
    await changes.insert({
      type: fileType,
      path: file.path,
      status: "not_modified",
      mtime: fileInfo.mtime!.getTime(),
      content: localContent,
    });
    return;
  }

  let fileStatus: ItemStatus;

  if (fileInfo === null) {
    // File doesn't exist locally - it's being created
    fileStatus = {
      type: fileType,
      path: file.path,
      status: "created",
      mtime: updatedAt.getTime(),
    };
  } else {
    // File exists - check if it's modified
    const localMtime = fileInfo.mtime!.getTime();
    const projectMtime = updatedAt.getTime();

    // Get its content for modification checking
    const localContent = await Deno.readTextFile(join(originalRoot, path));
    const projectContent = await sdk.projects.files.getContent(projectId, {
      path,
      branch_id: branchId,
      version,
    }).then((resp) => resp.text());

    const modified = isFileModified({
      srcContent: localContent,
      srcMtime: localMtime,
      dstContent: projectContent,
      dstMtime: projectMtime,
    });

    if (modified) {
      fileStatus = {
        type: fileType,
        path: file.path,
        status: "modified",
        mtime: localMtime,
        content: localContent,
        where: "local",
      };
    } else {
      fileStatus = {
        type: fileType,
        path: file.path,
        status: "not_modified",
        mtime: localMtime,
        content: localContent,
      };
    }
  }

  // Track file status
  await changes.insert(fileStatus);

  // Stop here for dry runs
  if (dryRun) return;

  // Ensure target directory exists
  await ensureDir(join(targetRoot, dirname(path)));

  // Copy unmodified files directly, otherwise fetch and write content
  if (fileStatus.status === "not_modified") {
    await Deno.copyFile(join(originalRoot, path), join(targetRoot, path));
  } else {
    const content = await sdk.projects.files.getContent(
      projectId,
      { path: file.path, branch_id: branchId, version },
    ).then((resp) => resp.text());

    await Deno.writeTextFile(join(targetRoot, path), content);
  }

  // Set the file's mtime to match the source
  await Deno.utime(join(targetRoot, path), updatedAt, updatedAt);
}
