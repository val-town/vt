import { Command } from "@cliffy/command";
import { basename } from "@std/path";
import VTClient from "~/vt/vt/VTClient.ts";
import { user } from "~/sdk.ts";
import { APIError } from "@valtown/sdk";
import { doWithSpinner, getClonePath } from "~/cmd/utils.ts";

export const createCmd = new Command()
  .name("create")
  .description("Create a new Val Town project")
  .arguments("<projectName:string> [targetDir:string]")
  .option("--public", "Create as public project (default)")
  .option("--private", "Create as private project")
  .option("--unlisted", "Create as unlisted project")
  .option("--no-editor-files", "Skip creating editor configuration files")
  .option("-d, --description <desc:string>", "Project description")
  .example(
    "Start fresh",
    `
vt create my-project
cd ./my-project
vt browse
vt watch # syncs changes to val town`,
  )
  .example(
    "Work on an existing project",
    `
vt clone username/projectName
cd ./projectName
vim index.tsx
vt push`,
  )
  .example(
    "Check out a new branch",
    `
cd ./projectName
vt checkout -b my-branch
vim index.tsx
vt push
vt checkout main`,
  )
  .action(async (
    {
      public: isPublic,
      private: isPrivate,
      unlisted,
      description,
    }: {
      public?: boolean;
      private?: boolean;
      unlisted?: boolean;
      description?: string;
    },
    projectName: string,
    targetDir?: string,
  ) => {
    await doWithSpinner("Creating new project...", async (spinner) => {
      const clonePath = getClonePath(targetDir, projectName);

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

      try {
        const vt = await VTClient.create({
          rootPath: clonePath,
          projectName,
          username: user.username!,
          privacy,
          description,
        });
        await vt.addEditorFiles();

        spinner.succeed(
          `Created ${privacy} project ${projectName} in ./${
            basename(clonePath)
          }`,
        );
      } catch (error) {
        if (error instanceof APIError && error.status === 409) {
          throw new Error(`Project name "${projectName}" already exists`);
        } else throw error;
      }
    });
  });
