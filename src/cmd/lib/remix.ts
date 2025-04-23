import { Command } from "@cliffy/command";
import { join } from "@std/path";
import VTClient from "~/vt/vt/VTClient.ts";
import { user, valExists } from "~/sdk.ts";
import { APIError } from "@valtown/sdk";
import { doWithSpinner } from "~/cmd/utils.ts";
import { parseValUrl } from "~/cmd/parsing.ts";
import { randomIntegerBetween } from "@std/random";

export const remixCmd = new Command()
  .name("remix")
  .description("Remix a Val Town val")
  .arguments(
    "<fromvalUri:string> [newvalName:string] [targetDir:string]",
  )
  .option("--public", "Remix as public val (default)", {
    conflicts: ["private", "unlisted"],
  })
  .option("--private", "Remix as private val", {
    conflicts: ["public", "unlisted"],
  })
  .option("--unlisted", "Remix as unlisted val", {
    conflicts: ["public", "private"],
  })
  .option("--no-editor-files", "Skip creating editor configuration files")
  .option("-d, --description <desc:string>", "Val description")
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
    fromvalUri: string,
    newvalName?: string,
    targetDir?: string,
  ) => {
    await doWithSpinner("Remixing Val Town val...", async (spinner) => {
      // Parse the val uri for the val we are remixing
      const {
        ownerName: sourcevalUsername,
        valName: sourcevalName,
      } = parseValUrl(
        fromvalUri,
        user.username!,
      );

      // Determine val name based on input or generate one if needed
      let valName: string;
      if (newvalName) {
        // Use explicitly provided name
        valName = newvalName;
      } else if (
        !await valExists({
          valName: sourcevalName,
          username: user.username!,
        })
      ) {
        // Use source val name if it doesn't already exist
        valName = sourcevalName;
      } else {
        // Generate a unique name with random suffix
        valName = `${sourcevalName}_remix_${
          randomIntegerBetween(10000, 99999)
        }`;
      }

      // Determine the target directory
      let rootPath: string;
      if (targetDir) {
        // Use explicitly provided target directory
        rootPath = join(Deno.cwd(), targetDir, valName);
      } else {
        // Default to current directory + val name
        rootPath = join(Deno.cwd(), valName);
      }

      // Determine privacy setting (defaults to public)
      const privacy = isPrivate ? "private" : unlisted ? "unlisted" : "public";

      try {
        // Use the remix function with updated signature
        const vt = await VTClient.remix({
          rootPath,
          srcValUsername: sourcevalUsername,
          srcValName: sourcevalName,
          dstValName: valName,
          dstValPrivacy: privacy,
          description,
        });

        if (editorFiles) await vt.addEditorFiles();

        spinner.succeed(
          `Remixed "@${sourcevalUsername}/${sourcevalName}" to ${privacy} val "@${user.username}/${valName}"`,
        );
      } catch (error) {
        if (error instanceof APIError && error.status === 409) {
          throw new Error(`Val name "${valName}" already exists`);
        } else throw error;
      }
    });
  });
