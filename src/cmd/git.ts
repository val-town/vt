import { Command } from "@cliffy/command";
import { user } from "~/sdk.ts";
import VT from "~/vt/Vt.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";

const cloneCmd = new Command()
  .name("clone")
  .description("Clone a val town project")
  .arguments("<projectUri:string> [cloneDir:string] [branchName:string]")
  .action(
    async (_, projectUri: string, cloneDir?: string, branchName?: string) => {
      // Split the project URI into parts
      const parts = projectUri.split("/");

      let ownerName: string;
      let projectName: string;

      if (parts.length === 1) {
        // Assume the user is the owner if no owner is provided
        ownerName = user.username!;
        projectName = parts[0];
      } else if (parts.length === 2) {
        [ownerName, projectName] = parts;
      } else {
        throw new Error("Invalid project URI");
      }

      // Ensure the user is cloning their own project
      if (user.username !== ownerName) {
        throw new Error("You can only clone your own projects");
      }

      cloneDir = cloneDir || Deno.cwd();
      branchName = branchName || DEFAULT_BRANCH_NAME;

      // Use the updated VT.clone method with the branch ID
      await VT.clone(cloneDir, ownerName, projectName, branchName);
    },
  );

export { cloneCmd };
