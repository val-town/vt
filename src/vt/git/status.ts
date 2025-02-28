import sdk from "~/sdk.ts";
import { basename, dirname, join, relative } from "jsr:@std/path";
import { walk } from "jsr:@std/fs/walk";
import { withoutValExtension } from "~/vt/git/paths.ts";
import { globToRegExp } from "@std/path/glob-to-regexp";

const STAT_PROMISES_BATCH_SIZE = 50;

export interface FileStatus {
  path: string;
  status: "modified" | "not_modified" | "deleted" | "created";
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
  for (const [cleanPath, { originalPath, modTime }] of localFiles.entries()) {
    if (!cleanPath) continue; // Skip empty paths

    const projectModTime = projectFiles.get(cleanPath);

    if (projectModTime === undefined) {
      // File exists locally but not in project - it's created
      result.created.push({
        path: cleanPath,
        status: "created",
      });
    } else {
      // File exists in both places, so check if modified
      if (modTime > projectModTime) {
        // To make sure it is actually modified we have to actually check the
        // content delta :(. The mtime is a heuristic.
        const isModified = await isFileModified(
          targetDir,
          originalPath,
          cleanPath,
          projectId,
        );
        if (isModified) {
          result.modified.push({
            path: cleanPath,
            status: "modified",
          });
        }
      } else {
        result.not_modified.push({
          path: cleanPath,
          status: "not_modified",
        });
      }
    }
  }

  // Check for files that exist in project but not locally
  for (const [projectPath, _] of projectFiles.entries()) {
    if (!localFiles.has(projectPath)) {
      result.deleted.push({
        path: projectPath,
        status: "deleted",
      });
    }
  }

  // TODO: handle renames

  return result;
}

async function isFileModified(
  targetDir: string,
  originalPath: string,
  cleanPath: string,
  projectId: string,
): Promise<boolean> {
  const projectFileContent = await sdk.projects.files.content(
    projectId,
    encodeURIComponent(join(
      dirname(cleanPath),
      withoutValExtension(basename(cleanPath)),
    )),
  );

  // For some reason the local paths seem to have an extra newline
  const localFileContent = (await Deno.readTextFile(
    join(targetDir, originalPath),
  )).slice(0, -1);

  return projectFileContent !== localFileContent;
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
      .filter((file) =>
        file.type !== "directory" &&
        !shouldIgnorePath(file.path, ignorePatterns)
      )
      .map((file) => [
        file.path,
        new Date(file.updatedAt).getTime(),
      ]),
  );
}

async function getLocalFiles(
  targetDir: string,
  ignorePatterns: RegExp[],
): Promise<Map<string, { originalPath: string; modTime: number }>> {
  const files = new Map<string, { originalPath: string; modTime: number }>();
  const statPromises: Promise<void>[] = [];

  for await (const entry of walk(targetDir)) {
    // Skip directories, we don't track directories themselves as objects
    if (entry.isDirectory) {
      continue;
    }

    // Check  if this is on the ignore list
    const relativePath = relative(targetDir, entry.path);
    if (shouldIgnorePath(relativePath, ignorePatterns)) {
      continue;
    }

    // Queue up stat operations for files
    statPromises.push(
      Deno.stat(entry.path).then((stat) => {
        if (stat.mtime === null) {
          throw new Error("File modification time is null");
        }

        // Store both the cleaned path and original path. We'll want access to
        // the original (real) path for later when we're accessing mtimes.
        const cleanedPath = withoutValExtension(relativePath);
        if (cleanedPath) { // Only add non-empty paths
          files.set(cleanedPath, {
            originalPath: relativePath,
            modTime: stat.mtime.getTime(),
          });
        }
      }).catch(() => {
        throw new Error(`Failed to stat file: ${entry.path}`);
      }),
    );

    // Process stats in batches of 50
    if (statPromises.length >= STAT_PROMISES_BATCH_SIZE) {
      await Promise.all(statPromises);
      statPromises.length = 0;
    }
  }

  await Promise.all(statPromises);

  return files;
}
