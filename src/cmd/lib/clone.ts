import { Command } from "@cliffy/command";
import { user } from "~/sdk.ts";
import { ALWAYS_IGNORE_PATTERNS, DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { parseProjectUri } from "~/cmd/parsing.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { checkDirectory } from "~/utils.ts";
import { relative } from "@std/path";
import * as join from "@std/path/join";
import { doWithSpinner } from "~/cmd/utils.ts";

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
  .action((_, projectUri: string, rootPath?: string, branchName?: string) => {
    doWithSpinner("Cloning project...", async ({ succeed }) => {
      let targetDir = rootPath || Deno.cwd();

      const { ownerName, projectName } = parseProjectUri(
        projectUri,
        user.username!,
      );

      branchName = branchName || DEFAULT_BRANCH_NAME;

      // By default, if the target directory is the current working directory,
      // then use the project name as the target directory
      if (rootPath === undefined) {
        targetDir = join.join(targetDir, projectName);
      }

      const vt = await VTClient.init({
        rootPath: targetDir,
        username: ownerName,
        projectName,
        branchName,
      });

      // Make sure that the directory is safe to clone into (exists, or gets
      // created and then exists, and wasn't nonempty) deno-fmt-ignore
      await checkDirectory(targetDir, { gitignoreRules: ALWAYS_IGNORE_PATTERNS, });

      await vt.clone(targetDir);
      await vt.addEditorFiles();

      succeed(
        `Project ${ownerName}/${projectName} cloned to "./${
          relative(Deno.cwd(), targetDir)
        }"`,
      );
    });
  });
