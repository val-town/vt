import { Command } from "@cliffy/command";
import { basename, join } from "@std/path";
import VTClient from "~/vt/vt/VTClient.ts";
import { user } from "~/sdk.ts";
import { APIError } from "@valtown/sdk";
import { doWithSpinner } from "~/cmd/utils.ts";

export const createCmd = new Command()
  .name("create")
  .description("Create a new Val Town project")
  .arguments("<projectName:string> [targetDir:string]")
  .option("--public", "Create as public project (default)", {
    conflicts: ["private", "unlisted"],
  })
  .option("--private", "Create as private project", {
    conflicts: ["public", "unlisted"],
  })
  .option("--unlisted", "Create as unlisted project", {
    conflicts: ["public", "private"],
  })
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
      let rootPath: string;
      if (!targetDir) {
        rootPath = join(Deno.cwd(), projectName);
      } else rootPath = join(targetDir, projectName);

      // Determine privacy setting (defaults to public)
      const privacy = isPrivate ? "private" : unlisted ? "unlisted" : "public";

      try {
        const vt = await VTClient.create(
          rootPath,
          projectName,
          user.username!, // Init the client with authenticated user
          privacy,
          description,
        );
        await vt.addEditorFiles();

        spinner.succeed(
          `Created ${privacy} project ${projectName} in ./${
            basename(rootPath)
          }`,
        );
      } catch (error) {
        if (error instanceof APIError && error.status === 409) {
          throw new Error(`Project name "${projectName}" already exists`);
        } else throw error;
      }
    });
  });
