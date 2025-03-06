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
import { colors } from "@cliffy/ansi/colors";
import { Table } from "@cliffy/table";
import ValTown from "@valtown/sdk";

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
  .option("-f, --force", "Force the pull even if there are uncommitted changes")
  .action(async ({ force }: { force?: boolean }) => {
    const spinner = new Kia("Pulling latest changes...");
    const cwd = Deno.cwd();

    try {
      const vt = VTClient.from(cwd);
      spinner.start();

      if (!force && await vt.isDirty(cwd)) {
        spinner.fail(
          "Cannot pull with uncommitted changes. " +
            "Use `pull -f` to discard local changes.",
        );
        return;
      }

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

const checkoutCmd = new Command()
  .name("checkout")
  .description("Check out a different branch")
  .arguments("[existingBranchName:string]")
  .option(
    "-b, --branch <newBranchName:string>",
    "Create a new branch with the specified name",
  )
  .option(
    "-f, --force",
    "Force checkout by ignoring local changes",
  )
  .action(
    async (
      { branch, force }: { branch?: string; force?: boolean },
      existingBranchName?: string,
    ) => {
      const spinner = new Kia("Checking out branch...");
      const cwd = Deno.cwd();

      const vt = VTClient.from(cwd);
      const config = await vt.meta.loadConfig();
      try {
        spinner.start();

        if (!force && await vt.isDirty(cwd)) {
          spinner.fail(
            "Cannot checkout with uncommitted changes. " +
              "Use `checkout -f` to ignore local changes.",
          );
          return;
        }

        if (branch) {
          // -b flag was used, create new branch from source
          try {
            await vt.checkout(cwd, branch, config.currentBranch);

            const existingBranchName = await sdk.projects.branches.retrieve(
              config.projectId,
              config.currentBranch,
            ).then((branch) => branch.name);

            spinner.succeed(
              `Created and switched to new branch "${branch}" from "${existingBranchName}"`,
            );
          } catch (error) {
            if (error instanceof ValTown.APIError && error.status === 409) {
              spinner.fail(`Branch "${branch}" already exists.`);
            } else {
              throw error; // Re-throw error if it's not a 409
            }
          }
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
          spinner.succeed(`Switched to branch "${existingBranchName}"`);
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

export { branchCmd, checkoutCmd, cloneCmd, pullCmd, statusCmd };
