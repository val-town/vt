import { Command } from "@cliffy/command";
import { basename } from "@std/path";
import VTClient from "~/vt/vt/VTClient.ts";
import { user } from "~/sdk.ts";
import { APIError } from "@valtown/sdk";
import { doWithSpinner, getClonePath } from "~/cmd/utils.ts";

export const createCmd = new Command()
  .name("create")
  .description("Create a new Val Town val")
  .arguments("<valName:string> [targetDir:string]")
  .option("--public", "Create as public val (default)", {
    conflicts: ["private", "unlisted"],
  })
  .option("--private", "Create as private val", {
    conflicts: ["public", "unlisted"],
  })
  .option("--unlisted", "Create as unlisted val", {
    conflicts: ["public", "private"],
  })
  .option("--no-editor-files", "Skip creating editor configuration files")
  .option("-d, --description <desc:string>", "Val description")
  .example(
    "Start fresh",
    `
vt create my-val
cd ./my-val
vt browse
vt watch # syncs changes to val town`,
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
    }: {
      public?: boolean;
      private?: boolean;
      unlisted?: boolean;
      description?: string;
    },
    valName: string,
    targetDir?: string,
  ) => {
    await doWithSpinner("Creating new val...", async (spinner) => {
      const clonePath = getClonePath(targetDir, valName);

      // Determine privacy setting (defaults to public)
      const privacy = isPrivate ? "private" : unlisted ? "unlisted" : "public";

      try {
        const vt = await VTClient.create({
          rootPath: clonePath,
          valName,
          username: user.username!,
          privacy,
          description,
        });
        await vt.addEditorFiles();

        spinner.succeed(
          `Created ${privacy} val "${valName}" in "${basename(clonePath)}"`,
        );
      } catch (error) {
        if (error instanceof APIError && error.status === 409) {
          throw new Error(`Val name "${valName}" already exists`);
        } else throw error;
      }
    });
  });
