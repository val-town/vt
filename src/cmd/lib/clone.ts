import { Command } from "@cliffy/command";
import { user } from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { parseProjectUri } from "~/cmd/parsing.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { relative } from "@std/path";
import { doWithSpinner, getClonePath } from "~/cmd/utils.ts";

export const cloneCmd = new Command()
  .name("clone")
  .description("Clone a val town project")
  .arguments("<projectUri:string> [cloneDir:string] [branchName:string]")
  .example(
    "Clone with username/projectName",
    `vt clone username/projectName`,
  )
  .example(
    "Clone into the current directory",
    `vt clone username/projectName .`,
  )
  .example(
    "Clone with link",
    `vt clone https://www.val.town/x/username/projectName`,
  )
  .example(
    "Clone into a new directory",
    `vt clone username/projectName new-directory`,
  )
  .action(
    async (_, projectUri: string, cloneDir?: string, branchName?: string) => {
      return await doWithSpinner("Cloning project...", async (spinner) => {
        const { ownerName, projectName } = parseProjectUri(
          projectUri,
          user.username!,
        );

        branchName = branchName || DEFAULT_BRANCH_NAME;
        const clonePath = getClonePath(cloneDir, projectName);

        const vt = await VTClient.clone({
          rootPath: clonePath,
          projectName,
          username: ownerName,
        });
        await vt.addEditorFiles();

        spinner.succeed(
          `Project ${ownerName}/${projectName} cloned to "${
            relative(Deno.cwd(), clonePath)
          }"`,
        );
      });
    },
  );
