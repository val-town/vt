import { Command } from "@cliffy/command";
import { join } from "@std/path";
import VTClient from "~/vt/vt/VTClient.ts";
import { getCurrentUser, projectExists } from "~/sdk.ts";
import { APIError } from "@valtown/sdk";
import { doWithSpinner } from "~/cmd/utils.ts";
import { parseProjectUri } from "~/cmd/parsing.ts";
import { randomIntegerBetween } from "@std/random";
import { ensureAddEditorFiles } from "~/cmd/lib/utils/messages.ts";
import { Confirm } from "@cliffy/prompt";
import { DEFAULT_EDITOR_TEMPLATE } from "~/consts.ts";

export const remixCmd = new Command()
  .name("remix")
  .description("Remix a Val Town project")
  .arguments(
    "<fromProjectUri:string> [newProjectName:string] [targetDir:string]",
  )
  .option("--public", "Remix as public project (default)", {
    conflicts: ["private", "unlisted"],
  })
  .option("--private", "Remix as private project", {
    conflicts: ["public", "unlisted"],
  })
  .option("--unlisted", "Remix as unlisted project", {
    conflicts: ["public", "private"],
  })
  .option("--no-editor-files", "Skip creating editor configuration files")
  .option("-d, --description <desc:string>", "Project description")
  .example(
    "Bootstrap a website",
    `
   vt remix std/reactHonoStarter myNewWebsite
   cd ./myNewWebsite
   vt browse
   vt watch # syncs changes to val town`,
  )
  .action(async (
    {
      private: isPrivate,
      unlisted,
      description,
      editorFiles = true,
    }: {
      public?: boolean;
      private?: boolean;
      unlisted?: boolean;
      description?: string;
      editorFiles?: boolean;
    },
    fromProjectUri: string,
    newProjectName?: string,
    targetDir?: string,
  ) => {
    await doWithSpinner("Remixing Val Town project...", async (spinner) => {
      const user = await getCurrentUser();

      // Parse the project uri for the project we are remixing
      const {
        ownerName: sourceProjectUsername,
        projectName: sourceProjectName,
      } = parseProjectUri(
        fromProjectUri,
        user.username!,
      );

      // Determine project name based on input or generate one if needed
      let projectName: string;
      if (newProjectName) {
        // Use explicitly provided name
        projectName = newProjectName;
      } else if (
        !await projectExists({
          projectName: sourceProjectName,
          username: user.username!,
        })
      ) {
        // Use source project name if it doesn't already exist
        projectName = sourceProjectName;
      } else {
        // Generate a unique name with random suffix
        projectName = `${sourceProjectName}_remix_${
          randomIntegerBetween(10000, 99999)
        }`;
      }

      // Determine the target directory
      let rootPath: string;
      if (targetDir) {
        // Use explicitly provided target directory
        rootPath = join(Deno.cwd(), targetDir, projectName);
      } else {
        // Default to current directory + project name
        rootPath = join(Deno.cwd(), projectName);
      }

      // Determine privacy setting (defaults to public)
      const privacy = isPrivate ? "private" : unlisted ? "unlisted" : "public";

      try {
        // Use the remix function with updated signature
        const vt = await VTClient.remix({
          rootPath,
          srcProjectUsername: sourceProjectUsername,
          srcProjectName: sourceProjectName,
          dstProjectName: projectName,
          dstProjectPrivacy: privacy,
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
          `Remixed "@${sourceProjectUsername}/${sourceProjectName}" to ${privacy} project "@${user.username}/${projectName}"`,
        );
      } catch (error) {
        if (error instanceof APIError && error.status === 409) {
          throw new Error(`Project name "${projectName}" already exists`);
        } else throw error;
      }
    });
  });
