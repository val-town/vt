import sdk, { listProjectItems } from "~/sdk.ts";
import type Valtown from "@valtown/sdk";
import { shouldIgnore } from "~/vt/lib/paths.ts";
import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import { doAtomically } from "~/vt/lib/utils.ts";

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
 */
export function clone({
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
  gitignoreRules?: string[];
}): Promise<void> {
  return doAtomically(
    async (tmpDir) => {
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
            await ensureDir(path.join(tmpDir, file.path));
          } else {
            // Start a create file task in the background
            const fullPath = path.join(tmpDir, file.path);
            await createFile(
              fullPath,
              projectId,
              branchId,
              version,
              file,
            );
          }
        }));
    },
    targetDir,
    "vt_clone_",
  );
}

async function createFile(
  rootPath: string,
  projectId: string,
  branchId: string,
  version: number,
  file: Valtown.Projects.FileRetrieveResponse.Data,
): Promise<void> {
  const fullPath = path.join(path.dirname(rootPath), file.name);

  // Add all needed parents for creating the file
  await ensureDir(path.dirname(fullPath));

  const updatedAt = new Date(file.updatedAt);

  // Check if file exists and has the same mtime as file.updatedAt
  const fileInfo = await Deno.stat(fullPath).catch(() => null);
  if (fileInfo) {
    if (fileInfo.mtime && fileInfo.mtime.getTime() === updatedAt.getTime()) {
      return; // If mtime matches updatedAt, no need to update
    }
  }

  // Get and write the file content
  await sdk.projects.files.getContent(
    projectId,
    { path: file.path, branch_id: branchId, version },
  )
    .then((resp) => resp.text())
    .then((content) => Deno.writeTextFile(fullPath, content));

  // Set the file's mtime right after creating it
  await Deno.utime(fullPath, updatedAt, updatedAt);
}
