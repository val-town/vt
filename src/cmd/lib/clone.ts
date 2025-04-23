import { Command } from "@cliffy/command";
import { Input } from "@cliffy/prompt/input";
import { colors } from "@cliffy/ansi/colors";
import sdk, { user } from "~/sdk.ts";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";
import { parseValUrl } from "~/cmd/parsing.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { relative } from "@std/path";
import { doWithSpinner, getClonePath } from "~/cmd/utils.ts";
import { tty } from "@cliffy/ansi/tty";

export const cloneCmd = new Command()
  .name("clone")
  .description("Clone a Val")
  .arguments("[valUri:string] [targetDir:string] [branchName:string]")
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
  .action(
    async (_, valUri?: string, targetDir?: string, branchName?: string) => {
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
          console.log(colors.yellow("You don't have any vals yet."));
          return;
        }

        // Map vals to name format for selection
        const valNames = vals.map((p) => p.name);

        const selectedval = await Input.prompt({
          message: "Choose a val to clone",
          list: true,
          info: true,
          suggestions: valNames,
        });

        const val = vals.find((p) => p.name === selectedval);
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
        await vt.addEditorFiles();

        spinner.succeed(
          `Val ${ownerName}/${valName} cloned to "${
            relative(Deno.cwd(), clonePath)
          }"`,
        );
      });
    },
  );
