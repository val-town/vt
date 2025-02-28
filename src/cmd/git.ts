import { Command } from "@cliffy/command";
import { user } from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { parseProjectUri } from "~/cmd/parsing.ts";
import { isDirectoryEmpty } from "~/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import * as styles from "~/cmd/styling.ts";
import { colors } from "@cliffy/ansi/colors";
import Kia from "kia";

function getActiveDir(givenDir: string): string {
  return givenDir || Deno.cwd();
}

async function checkDirectory(rootPath: string) {
  try {
    try {
      const stat = await Deno.lstat(rootPath);

      if (!stat.isDirectory) {
        throw new Error(`Path ${rootPath} exists but is not a directory.`);
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        await Deno.mkdir(rootPath, { recursive: true });
      } else {
        throw error;
      }
    }

    if (!(await isDirectoryEmpty(rootPath))) {
      throw new Error(
        `Destination path ${rootPath} already exists and is not an empty directory.`,
      );
    }
  } catch (error) {
    throw error;
  }
}

const cloneCmd = new Command()
  .name("clone")
  .description("Clone a val town project")
  .arguments("<projectUri:string> [cloneDir:string] [branchName:string]")
  .action(
    async (_, projectUri: string, rootPath?: string, branchName?: string) => {
      const spinner = new Kia("Cloning project...");
      const activeDir = getActiveDir(rootPath || Deno.cwd());

      try {
        const { ownerName, projectName } = parseProjectUri(
          projectUri,
          user.username!,
        );

        branchName = branchName || DEFAULT_BRANCH_NAME;

        await checkDirectory(activeDir);

        const vt = await VTClient.init(
          activeDir,
          ownerName,
          projectName,
          undefined,
          branchName,
        );
        spinner.start();
        await vt.clone(activeDir);
        spinner.succeed(`Project cloned to ${activeDir}`);
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

export function formatStatus(path: string, status: string): string {
  const statusColors: Record<string, (text: string) => string> = {
    modified: colors.yellow,
    created: colors.green,
    deleted: colors.red,
    renamed: colors.blue,
    not_modified: colors.gray,
  };

  const statusPrefix: Record<string, string> = {
    modified: "M",
    created: "A",
    deleted: "D",
    renamed: "R",
    not_modified: " ",
  };

  const colorFn = statusColors[status] || colors.white;
  return `${colorFn(statusPrefix[status] || " ")} ${path}`;
}

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
        renamed: status.renamed.map((file) => ({
          path: `${file.oldPath} -> ${file.path}`,
        })),
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

export { cloneCmd, pullCmd, statusCmd };
