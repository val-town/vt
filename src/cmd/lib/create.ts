import { Command } from "@cliffy/command";
import { basename } from "@std/path";
import VTClient from "~/vt/vt/VTClient.ts";
import { getCurrentUser } from "../../../utils/sdk.ts";
import { APIError } from "@valtown/sdk";
import { doWithSpinner, getClonePath } from "~/cmd/utils.ts";
import { ensureAddEditorFiles } from "~/cmd/lib/utils/messages.ts";
import { Confirm } from "@cliffy/prompt";
import { DEFAULT_EDITOR_TEMPLATE } from "~/consts.ts";

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
      editorFiles,
    }: {
      public?: boolean;
      private?: boolean;
      unlisted?: boolean;
      description?: string;
      editorFiles?: boolean;
    },
    projectName: string,
    targetDir?: string,
  ) => {
    await doWithSpinner("Creating new project...", async (spinner) => {
      const clonePath = getClonePath(targetDir, projectName);
      const user = await getCurrentUser();

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

        if (editorFiles) {
          spinner.stop();
          const { editorTemplate } = await vt.getConfig().loadConfig();
          const confirmed = await Confirm.prompt(
            ensureAddEditorFiles(editorTemplate ?? DEFAULT_EDITOR_TEMPLATE),
          );
          if (confirmed) await vt.addEditorTemplate();
          console.log();
        }

        spinner.succeed(
          `Created ${privacy} project "${projectName}" in "${
            basename(clonePath)
          }"`,
        );
      } catch (error) {
        if (error instanceof APIError && error.status === 409) {
          throw new Error(`Project name "${projectName}" already exists`);
        } else throw error;
      }
    });
  });
