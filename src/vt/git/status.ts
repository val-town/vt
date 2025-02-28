import sdk from "~/sdk.ts";
import { relative } from "jsr:@std/path";
import { walk } from "jsr:@std/fs/walk";
import { withoutValExtension } from "~/vt/git/paths.ts";
import { globToRegExp } from "@std/path/glob-to-regexp";

export interface FileStatus {
  path: string;
  status: "modified" | "not_modified" | "deleted" | "created" | "renamed";
  oldPath?: string; // For renamed files
}

export interface StatusResult {
  modified: FileStatus[];
  not_modified: FileStatus[];
  deleted: FileStatus[];
  created: FileStatus[];
  renamed: FileStatus[];
}

/**
 * Scans a directory and determines the status of all files compared to the Val Town project.
 *
 * @param args The arguments for the status operation.
 * @param args.targetDir The directory to scan for changes.
 * @param args.projectId The Val Town project ID.
 * @param args.branchId Optional branch ID to check against.
 * @param args.ignoreGlobs Glob patterns for files to ignore.
 *
 * @returns A promise that resolves to a StatusResult object containing categorized files.
 */
export async function status({
  targetDir,
  projectId,
  branchId,
  ignoreGlobs,
}: {
  targetDir: string;
  projectId: string;
  branchId: string;
  ignoreGlobs: string[];
}): Promise<StatusResult> {
  const result: StatusResult = {
    modified: [],
    not_modified: [],
    deleted: [],
    created: [],
    renamed: [],
  };

  // Convert ignore globs to RegExp patterns
  const ignorePatterns = ignoreGlobs.map((glob) =>
    globToRegExp(glob, { extended: true, globstar: true })
  );

  // Get all files
  const localFiles = await getLocalFiles(
    targetDir,
    ignorePatterns,
  );
  const projectFiles = await getProjectFiles(
    projectId,
    branchId,
    ignorePatterns,
  );

  // Compare local files against project files
  for (const [localPath, localModTime] of localFiles.entries()) {
    if (!localPath) continue; // Skip empty paths

    const projectModTime = projectFiles.get(localPath);

    if (projectModTime === undefined) {
      // File exists locally but not in project - it's created
      result.created.push({
        path: localPath,
        status: "created",
      });
    } else {
      // File exists in both places - check if modified
      if (localModTime > projectModTime) {
        result.modified.push({
          path: localPath,
          status: "modified",
        });
      } else {
        result.not_modified.push({
          path: localPath,
          status: "not_modified",
        });
      }
    }
  }

  // Check for files that exist in project but not locally
  for (const [projectPath, _] of projectFiles.entries()) {
    if (!projectPath) continue; // Skip empty paths

    if (!localFiles.has(projectPath)) {
      result.deleted.push({
        path: projectPath,
        status: "deleted",
      });
    }
  }

  return result;
}

function shouldIgnorePath(path: string, ignorePatterns: RegExp[]): boolean {
  return ignorePatterns.some((pattern) => pattern.test(path));
}

async function getProjectFiles(
  projectId: string,
  branchId: string,
  ignorePatterns: RegExp[],
): Promise<Map<string, number>> {
  const projectFilesResponse = await sdk.projects.files.list(projectId, {
    branch_id: branchId,
    recursive: true,
  });

  return new Map(
    projectFilesResponse.data
      .filter((file) => !shouldIgnorePath(file.path, ignorePatterns))
      .map((file) => [
        file.path,
        new Date(file.updatedAt).getTime(),
      ]),
  );
}

async function getLocalFiles(
  targetDir: string,
  ignorePatterns: RegExp[],
): Promise<Map<string, number>> {
  const files = new Map<string, number>();
  const statPromises: Promise<void>[] = [];

  for await (const entry of walk(targetDir)) {
    const relativePath = relative(targetDir, entry.path);
    if (shouldIgnorePath(relativePath, ignorePatterns)) {
      continue;
    }

    // Queue up stat operations
    statPromises.push(
      Deno.stat(entry.path).then((stat) => {
        if (stat.mtime === null) {
          throw new Error("File modification time is null");
        }

        // Use withoutValExtension to modify the relativePath
        const cleanedPath = withoutValExtension(relativePath);
        if (cleanedPath) { // Only add non-empty paths
          files.set(cleanedPath, stat.mtime.getTime());
        }
      }).catch(() => {
        // Skip files we can't stat
      }),
    );

    // Process stats in batches of 50 to maintain reasonable concurrency
    if (statPromises.length >= 50) {
      await Promise.all(statPromises);
      statPromises.length = 0;
    }
  }

  // Process any remaining stat operations
  if (statPromises.length > 0) {
    await Promise.all(statPromises);
  }

  return files;
}
