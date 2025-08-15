import { Command, EnumType } from "@cliffy/command";
import { basename } from "@std/path";
import VTClient, { assertSafeDirectory } from "~/vt/vt/VTClient.ts";
import { getCurrentUser } from "~/sdk.ts";
import { APIError } from "@valtown/sdk";
import { doWithSpinner, getClonePath } from "~/cmd/utils.ts";
import { ensureAddEditorFiles } from "~/cmd/lib/utils/messages.ts";
import { Confirm, Select } from "@cliffy/prompt";
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
  .type("if-exists", new EnumType(["continue", "yes-and-upload", "cancel"]))
  .option(
    "--if-exists <action:if-exists>", // useful for testing
    "Upload existing files to the new Val if the directory is not empty",
  )
  .option("--no-editor-files", "Skip creating editor configuration files")
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
    "Upload existing files to a new Val",
    `vt create my-val ./folder/that/has/files/already`,
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
      ifExistsAction,
    }: {
      public?: boolean;
      private?: boolean;
      unlisted?: boolean;
      description?: string;
      editorFiles?: boolean;
      ifExistsAction?: "continue" | "yes-and-upload" | "cancel";
    },
    valName: string,
    targetDir?: string,
  ) => {
    await doWithSpinner("Creating new Val...", async (spinner) => {
      const user = await getCurrentUser();
      const clonePath = getClonePath(targetDir, valName);

      // Determine privacy setting (defaults to public)
      const privacy = isPrivate ? "private" : unlisted ? "unlisted" : "public";
      let doUpload = ifExistsAction === "yes-and-upload";

      try {
        try {
          await assertSafeDirectory(clonePath);
        } catch (e) {
          if (e instanceof Error && e.message.includes("not empty")) {
            if (ifExistsAction !== "cancel") {
              spinner.stop();
              const confirmContinue = await Select.prompt(
                {
                  message: `The directory "${
                    basename(clonePath)
                  }" already exists and is not empty. Do you want to continue?`,
                  options: [
                    { name: "Yes", value: "yes" },
                    { name: "Yes, and upload files", value: "yes_and_upload" },
                    { name: "No, cancel", value: "no" },
                  ],
                },
              );

              if (confirmContinue === "no") {
                Deno.exit(0);
              } else {
                doUpload = confirmContinue === "yes_and_upload";
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
          doUpload,
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
