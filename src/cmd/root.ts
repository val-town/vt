import { Command } from "@cliffy/command";
import manifest from "../../deno.json" with { type: "json" };
import * as cmds from "~/cmd/git.ts";
import { watchCmd } from "~/cmd/watch.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import open from "open";
import { basename, join } from "@std/path";
import sdk, { user } from "~/sdk.ts";
import { checkDirectory } from "~/utils.ts";
import { DEFAULT_IGNORE_PATTERNS } from "~/consts.ts";
import Kia from "kia";
import { APIError } from "@valtown/sdk";

const cmd = new Command()
  .name("vt")
  .version(manifest.version)
  .help({ colors: Deno.stdout.isTerminal() })
  .action(() => cmd.showHelp());

const createCmd = new Command()
  .name("create")
  .description("Create a new Val Town project")
  .arguments("<projectName:string> [targetDir:string]")
  .option("--public", "Create as public project (default)")
  .option("--private", "Create as private project")
  .option("--unlisted", "Create as unlisted project")
  .option("-d, --description <desc:string>", "Project description")
  .action(async (
    { public: isPublic, private: isPrivate, unlisted, description }: {
      public?: boolean;
      private?: boolean;
      unlisted?: boolean;
      description?: string;
    },
    projectName: string,
    targetDir?: string,
  ) => {
    const spinner = new Kia("Creating project...");
    let rootPath = targetDir || Deno.cwd();

    try {
      // Check for mutually exclusive privacy flags
      const privacyFlags =
        [isPublic, isPrivate, unlisted].filter(Boolean).length;
      if (privacyFlags > 1) {
        throw new Error(
          "Can only specify one privacy flag: --public, --private, or --unlisted",
        );
      }

      // Determine privacy setting (defaults to public)
      const privacy = isPrivate ? "private" : unlisted ? "unlisted" : "public";

      // If no target directory specified, use project name
      if (targetDir === undefined) rootPath = join(rootPath, projectName);

      // Make sure directory is safe to create project in
      await checkDirectory(rootPath, { ignoreGlobs: DEFAULT_IGNORE_PATTERNS });

      spinner.start();

      try {
        const vt = await VTClient.create(
          rootPath,
          projectName,
          user.username!, // Init the client with authenticated user
          privacy,
          description,
        );

        // Clone the initial project structure
        await vt.clone(rootPath);

        spinner.succeed(
          `Created ${privacy} project ${projectName} in ./${
            basename(rootPath)
          }`,
        );
      } catch (error) {
        if (error instanceof APIError && error.status === 409) {
          spinner.fail(`Project name "${projectName}" already exists`);
          return;
        } else {
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        spinner.fail(error.message);
      }
    }
  });

export const openCmd = new Command()
  .name("open")
  .description("Open the project in the browser")
  .action(async () => {
    const cwd = Deno.cwd();
    const spinner = new Kia("Opening project url...");
    try {
      const vt = VTClient.from(cwd);
      const meta = await vt.getMeta().loadConfig();
      const branch = await sdk.projects.branches.retrieve(
        meta.projectId,
        meta.currentBranch,
      );
      await open(branch.links.html);
      spinner.succeed(`Project url opened in browser: ${branch.links.html}`);
    } catch (error) {
      if (error instanceof Error) {
        spinner.fail(error.message);
      }
    }
  });

cmd.command("clone", cmds.cloneCmd);
cmd.command("pull", cmds.pullCmd);
cmd.command("push", cmds.pushCmd);
cmd.command("open", openCmd);
cmd.command("status", cmds.statusCmd);
cmd.command("branch", cmds.branchCmd);
cmd.command("watch", watchCmd);
cmd.command("checkout", cmds.checkoutCmd);
cmd.command("create", createCmd);

export { cmd };
