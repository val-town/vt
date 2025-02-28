import { Command } from "@cliffy/command";
import { user } from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { parseProjectUri } from "~/cmd/parsing.ts";
import { isDirectoryEmpty } from "~/utils.ts";
import VTClient from "~/vt/vt/mod.ts";
import * as styles from "~/cmd/styling.ts";
import { colors } from "@cliffy/ansi/colors";

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
      const activeDir = getActiveDir(rootPath || Deno.cwd());

      const { ownerName, projectName } = parseProjectUri(
        projectUri,
        user.username!,
      );

      if (user.username !== ownerName) {
        throw new Error("You can only clone your own projects");
      }

      branchName = branchName || DEFAULT_BRANCH_NAME;

      await checkDirectory(activeDir);

      const vt = await VTClient.init(
        activeDir,
        ownerName,
        projectName,
        undefined,
        branchName,
      );

      try {
        await vt.clone(activeDir);
      } catch (error) {
        if (error instanceof Error) {
          console.log(styles.error(error.message));
        }
      }

      console.log(styles.success(`Project cloned to ${activeDir}`));
    },
  );

const pullCmd = new Command()
  .name("pull")
  .description("Pull the latest changes for a val town project")
  .action(async () => {
    const cwd = Deno.cwd();

    const vt = VTClient.from(cwd);
    try {
      await vt.pull(cwd);
      console.log(styles.success(`Project pulled successfully to ${cwd}`));
    } catch (error) {
      if (error instanceof Error) {
        console.error(styles.error(error.message));
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
    const cwd = Deno.cwd();

    const vt = VTClient.from(cwd);
    try {
      const status = await vt.status(cwd);

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
        console.error(styles.error(error.message));
      }
    }
  });

export { cloneCmd, pullCmd, statusCmd };
