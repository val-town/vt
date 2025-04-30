import { Command } from "@cliffy/command";
import { Input } from "@cliffy/prompt/input";
import { colors } from "@cliffy/ansi/colors";
import sdk, { getCurrentUser } from "~/sdk.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { relative } from "@std/path";
import { doWithSpinner, getClonePath } from "~/cmd/utils.ts";
import { tty } from "@cliffy/ansi/tty";
import { Confirm } from "@cliffy/prompt";
import { ensureAddEditorFiles } from "~/cmd/lib/utils/messages.ts";
import { parseValUrl } from "~/cmd/parsing.ts";
import { DEFAULT_BRANCH_NAME, DEFAULT_EDITOR_TEMPLATE } from "~/consts.ts";

export const cloneCmd = new Command()
  .name("clone")
  .description("Clone a Val")
  .arguments("[valUri:string] [targetDir:string] [branchName:string]")
  .option("--no-editor-files", "Clone without editor configuration files")
  .example(
    "Interactive Val selection",
    `vt clone`,
  )
  .example(
    "Clone with username/valName",
    `vt clone username/valName`,
  )
  .example(
    "Clone into the current directory",
    `vt clone username/valName .`,
  )
  .example(
    "Clone with link",
    `vt clone https://www.val.town/x/username/valName`,
  )
  .example(
    "Clone into a new directory",
    `vt clone username/valName new-directory`,
  )
  .example(
    "Clone without editor files",
    `vt clone username/valName --no-editor-files`,
  )
  .action(
    async (
      { editorFiles }: { editorFiles: boolean },
      valUri?: string,
      targetDir?: string,
      branchName?: string,
    ) => {
      const user = await getCurrentUser();

      let ownerName: string;
      let valName: string;

      // If no val URI is provided, show interactive val selection
      if (!valUri) {
        const vals = await doWithSpinner(
          "Loading vals...",
          async (spinner) => {
            const allVals = await Array.fromAsync(sdk.me.vals.list({}));
            spinner.stop();
            return allVals;
          },
        );

        if (vals.length === 0) {
          console.log(colors.yellow("You don't have any Vals yet."));
          return;
        }

        // Map vals to name format for selection
        const valNames = vals.map((p) => p.name);

        const selectedVal = await Input.prompt({
          message: "Choose a Val to clone",
          list: true,
          info: true,
          suggestions: valNames,
        });

        const val = vals.find((p) => p.name === selectedVal);
        if (!val) {
          console.error(colors.red("Val not found"));
          return;
        }

        ownerName = val.author.username || user.username!;
        valName = val.name;

        // Scroll up a line so that they don't see the prompt they were just
        // given
        tty.scrollDown(1);
      } else {
        // Parse val URI if provided
        const parsed = parseValUrl(valUri, user.username!);
        ownerName = parsed.ownerName;
        valName = parsed.valName;
      }

      return await doWithSpinner("Cloning val...", async (spinner) => {
        branchName = branchName || DEFAULT_BRANCH_NAME;
        const clonePath = getClonePath(targetDir, valName);

        const vt = await VTClient.clone({
          rootPath: clonePath,
          valName,
          username: ownerName,
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
          `Val ${ownerName}/${valName} cloned to "${
            relative(Deno.cwd(), clonePath)
          }"`,
        );
      });
    },
  );
