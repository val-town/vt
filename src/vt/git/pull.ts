import { relative } from "@std/path";
import { copy, walk } from "@std/fs";
import { shouldIgnore } from "~/vt/git/paths.ts";
import sdk from "~/sdk.ts";
import { doAtomically } from "~/vt/git/utils.ts";
import { clone } from "~/vt/git/clone.ts";

export function pull({
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
}): Promise<void> {
  return doAtomically(
    async (tempDir) => {
      // Copy over all the files in the original dir into the temp dir
      await copy(targetDir, tempDir, {
        preserveTimestamps: true,
        overwrite: true,
      });

      // Clone all the files from the project into the temp dir
      await clone({
        targetDir: tempDir,
        projectId,
        branchId,
        version,
        gitignoreRules,
      });

      // Then delete all files that should no longer exist. So fetch all the
      // files from the server, and then look at all the files we cloned. After
      // cloning, we should not have files that no longer exist on the server,
      // so we can remove them.
      //
      // We do it this way where we copy over the current contents and then
      // clone because we want to keep files that exist locally and were never
      // pushed, along with all the ignored files.
      const files = new Set<string>();
      for await (
        const file of sdk.projects.files.list(projectId, {
          branch_id: branchId,
          version,
          recursive: true,
        })
      ) {
        files.add(file.path);
      }
      for await (const entry of walk(tempDir)) {
        const relativePath = relative(tempDir, entry.path);
        if (shouldIgnore(relativePath, gitignoreRules)) continue;
        if (entry.path === "" || entry.path === tempDir) continue;
        if (!files.has(relativePath)) {
          await Deno.remove(entry.path, { recursive: true });
        }
      }
    },
    targetDir,
    "vt_pull_",
    true,
  );
}
