import sdk from "~/sdk.ts";
import type Valtown from "@valtown/sdk";
import { removeEmptyDirs } from "~/utils.ts";
import { shouldIgnore } from "~/vt/git/paths.ts";
import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import { doAtomically } from "~/vt/git/utils.ts";

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
      const projectFilesResponse = await sdk.projects.files
        .list(projectId, { recursive: true, branch_id: branchId, version });

      const clonePromises: Promise<void>[] = [];
      for await (const file of projectFilesResponse.data) {
        // Skip directories
        if (file.type === "directory") continue;

        // Skip ignored files
        if (shouldIgnore(file.path, gitignoreRules)) continue;

        // Start a create file task in the background
        const fullPath = path.join(tmpDir, file.path);
        clonePromises.push(createFile(
          fullPath,
          projectId,
          branchId,
          version,
          file,
        ));
      }

      // Wait for all file operations to complete
      await Promise.all(clonePromises);

      removeEmptyDirs(tmpDir);
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
  file: Valtown.Projects.FileListResponse,
): Promise<void> {
  const fullPath = path.join(path.dirname(rootPath), file.name);

  // Add all needed parents for creating the file
  await ensureDir(path.dirname(fullPath));

  // Get and write the file content
  const content = await sdk.projects.files.getContent(
    projectId,
    encodeURIComponent(file.path),
    { branch_id: branchId, version },
  ).then((resp) => resp.text());

  await ensureDir(path.dirname(fullPath));
  await Deno.writeTextFile(fullPath, content);

  // Set the file's mtime right after creating it
  const updatedAt = new Date(file.updatedAt);
  await Deno.utime(fullPath, updatedAt, updatedAt);
}
