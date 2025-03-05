import { Command } from "@cliffy/command";
import sdk, { branchNameToId, user } from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME, DEFAULT_IGNORE_PATTERNS } from "~/consts.ts";
import { parseProjectUri } from "~/cmd/parsing.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import Kia from "kia";
import { checkDirectory } from "~/utils.ts";
import { basename } from "@std/path";
import * as styles from "~/cmd/styling.ts";
import * as join from "@std/path/join";
import { checkDirtyState } from "~/cmd/utils.ts";

const cloneCmd = new Command()
  .name("clone")
  .description("Clone a val town project")
  .arguments("<projectUri:string> [cloneDir:string] [branchName:string]")
  .action(
    async (
      _: unknown,
      projectUri: string,
      rootPath?: string,
      branchName?: string,
    ) => {
      const spinner = new Kia("Cloning project...");
      let targetDir = rootPath || Deno.cwd();

      try {
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

        // Make sure that the directory is safe to clone into (exists, or gets
        // created and then exists, and wasn't nonempty)
        await checkDirectory(targetDir, {
          ignoreGlobs: DEFAULT_IGNORE_PATTERNS,
        });

        spinner.start();
        await vt.clone(targetDir);
        spinner.succeed(
          `Project ${ownerName}/${projectName} cloned to ${
            "./" + basename(targetDir)
          }`,
        );
      } catch (error) {
        if (error instanceof Error) {
          spinner.fail(error.message);
        }
      }
    },
  );

const pullCmd = new Command()
  .name("pull")
  .description("Pull the latest changes for a val town project")
  .action(async () => {
    const spinner = new Kia("Pulling latest changes...");
    const cwd = Deno.cwd();

    try {
      const vt = VTClient.from(cwd);
      await checkDirtyState(vt, cwd, "pull");

      spinner.start();
      await vt.pull(cwd);
      spinner.succeed(`Project pulled successfully to ${cwd}`);
    } catch (error) {
      if (error instanceof Error) {
        spinner.fail(error.message);
      }
    }
  });

const statusCmd = new Command()
  .name("status")
  .description("Show the working tree status")
  .action(async () => {
    const spinner = new Kia("Checking status...");
    const cwd = Deno.cwd();

    try {
      spinner.start();
      const vt = VTClient.from(cwd);
      const status = await vt.status(cwd);
      spinner.stop(); // Stop spinner before showing status

      const statusMap = {
        modified: status.modified.map((file) => ({ path: file.path })),
        created: status.created.map((file) => ({ path: file.path })),
        deleted: status.deleted.map((file) => ({ path: file.path })),
      };

      // Print all changed files
      Object.entries(statusMap).forEach(([type, files]) => {
        files.forEach((file) => {
          console.log(styles.formatStatus(file.path, type));
        });
      });

      // Print summary
      const totalChanges = Object.values(statusMap).reduce(
        (sum, files) => sum + files.length,
        0,
      );

      if (totalChanges === 0) {
        console.log(styles.success("Working tree clean"));
      } else {
        console.log("\nChanges:");
        Object.entries(statusMap).forEach(([type, files]) => {
          if (files.length > 0) {
            console.log(`  ${files.length} ${type}`);
          }
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        spinner.fail(error.message);
      }
    }
  });

const checkoutCmd = new Command()
  .name("checkout")
  .description("Check out a different branch")
  .arguments("[existingBranchName:string]")
  .option(
    "-b, --branch <newBranchName:string>",
    "Create a new branch with the specified name",
  )
  .action(
    async ({ branch }: { branch?: string }, existingBranchName?: string) => {
      const spinner = new Kia("Checking out branch...");
      const cwd = Deno.cwd();

      const vt = VTClient.from(cwd);
      const config = await vt.meta.loadConfig();
      try {
        await checkDirtyState(vt, cwd, "checkout");

        spinner.start();

        if (branch) {
          // -b flag was used, create new branch from source
          await vt.checkout(cwd, branch, config.currentBranch);
          spinner.succeed(
            `Created and switched to new branch '${branch}'${
              existingBranchName ? ` from '${existingBranchName}'` : ""
            }`,
          );
        } else if (existingBranchName) {
          // Regular checkout. Check to see if branch exists.
          try {
            await branchNameToId(config.projectId, existingBranchName);
          } catch {
            const project = await sdk.projects.retrieve(config.projectId);
            throw new Error(
              `Branch "${existingBranchName}" not found in project "${project.name}"`,
            );
          }

          await vt.checkout(cwd, existingBranchName);
          spinner.succeed(`Switched to branch '${existingBranchName}'`);
        } else {
          throw new Error("Branch name is required");
        }
      } catch (error) {
        if (error instanceof Error) {
          spinner.fail(error.message);
        }
      }
    },
  );

export { checkoutCmd, cloneCmd, pullCmd, statusCmd };
