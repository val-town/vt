import { Command } from "@cliffy/command";
import { Input } from "@cliffy/prompt/input";
import { colors } from "@cliffy/ansi/colors";
import sdk, { getCurrentUser, typeaheadValNames, valNameToVal } from "~/sdk.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { relative } from "@std/path";
import { doWithSpinner, getClonePath } from "~/cmd/utils.ts";
import { tty } from "@cliffy/ansi/tty";
import { Confirm } from "@cliffy/prompt";
import { ensureAddEditorFiles } from "~/cmd/lib/utils/messages.ts";
import { parseValUrl } from "~/cmd/parsing.ts";
import { DEFAULT_BRANCH_NAME, DEFAULT_EDITOR_TEMPLATE } from "~/consts.ts";
import { arrayFromAsyncN } from "~/utils.ts";

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

      // If no Val URI is provided, show interactive Val selection
      if (!valUri) {
        let suggestions = new Set();
        const selectedVal = await Input.prompt({
          message: "Choose a Val to clone",
          list: true,
          info: true,
          validate: (input) => {
            const split = input.split("/");
            return suggestions.has(input) && (split.length === 2) &&
              split[1].length !== 0;
          },
          suggestions: async (prefix) => {
            suggestions = new Set(
              await typeaheadValNames(prefix || `${user.username}/`),
            );
            return Array.from(suggestions) as (string | number)[];
          },
        });

        const parts = selectedVal.split("/");
        let [handle, valName] = parts;
        const val = await valNameToVal(handle, valName);

        ownerName = val.author.username || user.username!;
        valName = val.name;

        // Scroll up a line so that they don't see the prompt they were just
        // given
        tty.scrollDown(1);
      } else {
        // Parse Val URI if provided
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
