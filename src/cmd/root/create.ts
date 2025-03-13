import { Command } from "@cliffy/command";
import { basename, join } from "@std/path";
import Kia from "kia";
import { checkDirectory } from "~/utils.ts";
import { DEFAULT_IGNORE_PATTERNS } from "~/consts.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { user } from "~/sdk.ts";
import { APIError } from "@valtown/sdk";

export const createCmd = new Command()
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
