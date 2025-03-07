import { Command } from "@cliffy/command";
import sdk, { user } from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME, DEFAULT_IGNORE_PATTERNS } from "~/consts.ts";
import { parseProjectUri } from "~/cmd/parsing.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import Kia from "kia";
import { checkDirectory } from "~/utils.ts";
import { basename } from "@std/path";
import * as styles from "~/cmd/styling.ts";
import * as join from "@std/path/join";
import { Table } from "@cliffy/table";
import type ValTown from "@valtown/sdk";
import { colors } from "@cliffy/ansi/colors";

const cloneCmd = new Command()
  .name("clone")
  .description("Clone a val town project")
  .arguments("<projectUri:string> [cloneDir:string] [branchName:string]")
  .example(
    "Clone with username/projectName",
    `vt clone username/projectName`,
  )
  .example(
    "Clone with link",
    `vt clone https://www.val.town/x/username/projectName`,
  )
  .action(
    async (_, projectUri: string, rootPath?: string, branchName?: string) => {
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
      spinner.start();
      const vt = VTClient.from(cwd);
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

const branchCmd = new Command()
  .name("branch")
  .description("List all project branches")
  .action(async () => {
    const cwd = Deno.cwd();

    try {
      const vt = VTClient.from(cwd);
      const meta = await vt.meta.loadConfig();

      const branches: ValTown.Projects.BranchListResponse[] = [];
      for await (
        const file of (await sdk.projects.branches.list(meta.projectId, {}))
          .data
      ) branches.push(file);

      const formatter = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });

      // Separate current branch, place it at the top, and then sort the rest
      // by update time
      const currentBranch = branches.find((branch) =>
        branch.id === meta.currentBranch
      );

      const otherBranches = branches
        .filter((branch) => branch.id !== meta.currentBranch)
        .sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

      const sortedBranches = currentBranch
        ? [currentBranch, ...otherBranches]
        : otherBranches;

      const branchesTableList = Table.from([
        [
          colors.bold("Name"),
          colors.bold("Version"),
          colors.bold("Created On"),
          colors.bold("Updated On"),
        ],
        ...sortedBranches.map(
          (branch) => [
            branch.id === meta.currentBranch
              ? colors.green(`* ${branch.name}`)
              : branch.name,
            colors.cyan(branch.version.toString()),
            colors.yellow(formatter.format(new Date(branch.createdAt))),
            colors.magenta(formatter.format(new Date(branch.updatedAt))),
          ],
        ),
      ]);

      console.log(branchesTableList.toString());
    } catch (error) {
      if (error instanceof Error) {
        console.log(colors.red(error.message));
      }
    }
  });

export { branchCmd, cloneCmd, pullCmd, statusCmd };
