import { Command } from "@cliffy/command";
import { basename } from "@std/path";
import VTClient, { assertSafeDirectory } from "~/vt/vt/VTClient.ts";
import { getCurrentUser } from "~/sdk.ts";
import { APIError } from "@valtown/sdk";
import { doWithSpinner, getClonePath } from "~/cmd/utils.ts";
import { ensureAddEditorFiles } from "~/cmd/lib/utils/messages.ts";
import { Confirm } from "@cliffy/prompt";
import { DEFAULT_EDITOR_TEMPLATE } from "~/consts.ts";

export const createCmd = new Command()
  .name("create")
  .description("Create a new Val")
  .arguments("<valName:string> [targetDir:string]")
  .option("--public", "Create as public Val (default)", {
    conflicts: ["private", "unlisted"],
  })
  .option("--private", "Create as private Val", {
    conflicts: ["public", "unlisted"],
  })
  .option("--unlisted", "Create as unlisted Val", {
    conflicts: ["public", "private"],
  })
  .option("--no-editor-files", "Skip creating editor configuration files")
  .option(
    "--upload-if-exists", // useful for testing
    "Upload existing files to the new Val if the directory is not empty",
  )
  .option("-d, --description <desc:string>", "Val description")
  .example(
    "Start fresh",
    `
vt create my-val
cd ./my-val
vt browse
vt watch # syncs changes to Val town`,
  )
  .example(
    "Work on an existing val",
    `
vt clone username/valName
cd ./valName
vim index.tsx
vt push`,
  )
  .example(
    "Check out a new branch",
    `
cd ./valName
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
      uploadIfExists,
    }: {
      public?: boolean;
      private?: boolean;
      unlisted?: boolean;
      description?: string;
      editorFiles?: boolean;
      uploadIfExists: boolean;
    },
    valName: string,
    targetDir?: string,
  ) => {
    await doWithSpinner("Creating new Val...", async (spinner) => {
      const user = await getCurrentUser();
      const clonePath = getClonePath(targetDir, valName);

      // Determine privacy setting (defaults to public)
      const privacy = isPrivate ? "private" : unlisted ? "unlisted" : "public";

      try {
        try {
          await assertSafeDirectory(clonePath);
        } catch (e) {
          if (e instanceof Error && e.message.includes("not empty")) {
            if (!uploadIfExists) {
              spinner.stop();
              const confirmContinue = await Confirm.prompt(
                `The directory "${
                  basename(clonePath)
                }" already exists and is not empty. Do you want to continue?` +
                  " Existing files will be uploaded to the new Val.",
              );

              if (!confirmContinue) {
                Deno.exit(0);
              }
            }
          } else {
            throw e;
          }
        }

        const vt = await VTClient.create({
          rootPath: clonePath,
          valName,
          username: user.username!,
          privacy,
          description,
          skipSafeDirCheck: true,
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
          `Created ${privacy} Val "${valName}" in "${basename(clonePath)}"`,
        );
      } catch (error) {
        if (error instanceof APIError && error.status === 409) {
          throw new Error(`Val name "${valName}" already exists`);
        } else throw error;
      }
    });
  });
