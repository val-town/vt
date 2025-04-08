import sdk, { listProjectItems } from "~/sdk.ts";
import type Valtown from "@valtown/sdk";
import { shouldIgnore } from "~/vt/lib/paths.ts";
import { ensureDir, exists } from "@std/fs";
import { doAtomically, isFileModified } from "~/vt/lib/utils.ts";
import type { ProjectItemType } from "~/consts.ts";
import { dirname } from "@std/path/dirname";
import { join } from "@std/path";
import { FileState, type FileStatus } from "~/vt/lib/FileState.ts";

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
}

/**
 * Clones a project by downloading its files and directories to the specified
 * target directory.
 *
 * @param params Options for the clone operation
 * @returns Promise that resolves with changes that were applied or would be applied (if dryRun=true)
 */
export function clone(params: CloneParams): Promise<FileState> {
  const {
    targetDir,
    projectId,
    branchId,
    version,
    gitignoreRules,
    dryRun = false,
  } = params;
  return doAtomically(
    async (tmpDir) => {
      const changes = FileState.empty();
      const projectItems = await listProjectItems(
        projectId,
        branchId,
        "",
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
              changes.insert({
                type: "directory" as ProjectItemType,
                path: file.path,
                status: "created",
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
              changes,
              dryRun,
            );
          }
        }));

      return [changes, !dryRun];
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
  file: Valtown.Projects.FileRetrieveResponse,
  changes: FileState,
  dryRun: boolean,
): Promise<void> {
  const updatedAt = new Date(file.updatedAt);
  const fileStatus: FileStatus = {
    type: file.type as ProjectItemType,
    path: file.path,
    status: "created", // Default status
  };

  // Check for existing file and determine status
  const fileInfo = await Deno
    .stat(join(originalRoot, path))
    .catch(() => null);

  if (fileInfo !== null) {
    const localMtime = (await Deno.stat(join(originalRoot, path)))
      .mtime!.getTime();
    const projectMtime = updatedAt.getTime();

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

    if (modified) fileStatus.status = "modified";
    else fileStatus.status = "not_modified";
  }

  // Track file status
  changes.insert(fileStatus);

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
