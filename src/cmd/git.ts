import { Command } from "@cliffy/command";
import { user } from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { parseProjectUri } from "~/cmd/parsing.ts";
import { isDirectoryEmpty } from "~/utils.ts";
import VTClient from "~/vt/vt/mod.ts";

async function checkDirectory(rootPath: string) {
  try {
    // Check if the directory exists
    const stat = await Deno.lstat(rootPath);

    // Ensure it's a directory
    if (!stat.isDirectory) {
      throw new Error(`Path ${rootPath} exists but is not a directory.`);
    }

    // Check if it's empty
    if (!(await isDirectoryEmpty(rootPath))) {
      throw new Error(
        `Destination path ${rootPath} already exists and is not an empty directory.`,
      );
    }
  } catch (error) {
    // If the error is about the directory not existing, ignore it
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

const cloneCmd = new Command()
  .name("clone")
  .description("Clone a val town project")
  .arguments("<projectUri:string> [cloneDir:string] [branchName:string]")
  .action(
    async (_, projectUri: string, rootPath?: string, branchName?: string) => {
      const { ownerName, projectName } = parseProjectUri(
        projectUri,
        user.username!,
      );

      if (user.username !== ownerName) {
        throw new Error("You can only clone your own projects");
      }

      rootPath = rootPath || Deno.cwd();
      branchName = branchName || DEFAULT_BRANCH_NAME;

      await checkDirectory(rootPath);

      // Direct call to VTClient.init
      const vt = await VTClient.init(
        rootPath,
        ownerName,
        projectName,
        undefined,
        branchName,
      );

      await vt.clone(rootPath);
      console.log(`Project cloned successfully to ${rootPath}`);
    },
  );

export { cloneCmd };
