import { Command } from "@cliffy/command";
import { join } from "@std/path";
import VTClient from "~/vt/vt/VTClient.ts";
import { getCurrentUser, valExists } from "~/sdk.ts";
import { APIError } from "@valtown/sdk";
import { doWithSpinner } from "~/cmd/utils.ts";
import { parseValUrl } from "~/cmd/parsing.ts";
import { randomIntegerBetween } from "@std/random";
import { ensureAddEditorFiles } from "~/cmd/lib/utils/messages.ts";
import { Confirm } from "@cliffy/prompt";
import { DEFAULT_EDITOR_TEMPLATE } from "~/consts.ts";

export const remixCmd = new Command()
  .name("remix")
  .description("Remix a Val")
  .arguments(
    "<fromValUri:string> [newValName:string] [targetDir:string]",
  )
  .option("--public", "Remix as public Val (default)", {
    conflicts: ["private", "unlisted"],
  })
  .option("--private", "Remix as private Val", {
    conflicts: ["public", "unlisted"],
  })
  .option("--unlisted", "Remix as unlisted Val", {
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
   vt watch # syncs changes to Val town`,
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
    fromValUri: string,
    newValName?: string,
    targetDir?: string,
  ) => {
    await doWithSpinner("Remixing Val...", async (spinner) => {
      const user = await getCurrentUser();

      const {
        ownerName: sourceValUsername,
        valName: sourceValName,
      } = parseValUrl(fromValUri, user.username!);

      // Determine Val name based on input or generate one if needed
      let valName: string;
      if (newValName) {
        // Use explicitly provided name
        valName = newValName;
      } else if (
        !await valExists({
          valName: sourceValName,
          username: user.username!,
        })
      ) {
        // Use source Val name if it doesn't already exist
        valName = sourceValName;
      } else {
        // Generate a unique name with random suffix
        valName = `${sourceValName}_remix_${
          randomIntegerBetween(10000, 99999)
        }`;
      }

      // Determine the target directory
      let rootPath: string;
      if (targetDir) {
        // Use explicitly provided target directory
        rootPath = join(Deno.cwd(), targetDir, valName);
      } else {
        // Default to current directory + Val name
        rootPath = join(Deno.cwd(), valName);
      }

      // Determine privacy setting (defaults to public)
      const privacy = isPrivate ? "private" : unlisted ? "unlisted" : "public";

      try {
        // Use the remix function with updated signature
        const vt = await VTClient.remix({
          rootPath,
          srcValUsername: sourceValUsername,
          srcValName: sourceValName,
          dstValName: valName,
          dstValPrivacy: privacy,
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
          `Remixed "@${sourceValUsername}/${sourceValName}" to ${privacy} Val "@${user.username}/${valName}"`,
        );
      } catch (error) {
        if (error instanceof APIError && error.status === 409) {
          throw new Error(`Val "${valName}" already exists`);
        } else throw error;
      }
    });
  });
