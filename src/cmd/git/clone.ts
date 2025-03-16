import { Command } from "@cliffy/command";
import { user } from "~/sdk.ts";
import { ALWAYS_IGNORE_PATTERNS, DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { parseProjectUri } from "~/cmd/parsing.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import Kia from "kia";
import { checkDirectory } from "~/utils.ts";
import { relative } from "@std/path";
import * as join from "@std/path/join";

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
    async (
      _: unknown,
      projectUri: string,
      rootPath?: string,
      branchName?: string,
    ) => {
      const spinner = new Kia("Cloning project...");
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

      const vt = await VTClient.init(
        targetDir,
        ownerName,
        projectName,
        undefined,
        branchName,
      );

      const relativeTargetDir = relative(Deno.cwd(), targetDir);
      try {
        // Make sure that the directory is safe to clone into (exists, or gets
        // created and then exists, and wasn't nonempty)
        await checkDirectory(targetDir, {
          ignoreGlobs: ALWAYS_IGNORE_PATTERNS,
        });

        spinner.start();
        await vt.clone(targetDir);
        spinner.succeed(
          `Project ${ownerName}/${projectName} cloned to "./${relativeTargetDir}"`,
        );
      } catch (error) {
        if (error instanceof Deno.errors.NotADirectory) {
          spinner.fail(
            `"./${relativeTargetDir}" exists but is not a directory.`,
          );
        } else if (error instanceof Deno.errors.AlreadyExists) {
          spinner.fail(
            `"./${relativeTargetDir}" already exists and is not empty.`,
          );
        } else throw error;
      } finally {
        spinner.stop();
      }
    },
  );
