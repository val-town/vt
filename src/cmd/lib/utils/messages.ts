import { colors } from "@cliffy/ansi/colors";
import { DEFAULT_EDITOR_TEMPLATE, DEFAULT_WRAP_WIDTH } from "~/consts.ts";
import wrap from "word-wrap";

export const noChangesDryRunMsg = "Dry run completed. " +
  colors.underline("No changes were made.");

export function ensureAddEditorFiles(editorTemplate: string) {
  if (editorTemplate === DEFAULT_EDITOR_TEMPLATE) {
    return `Would you like \`vt\` to add editor files to this Val?\n${
      wrap(
        "\nThis will add files like a deno.json and .vscode folder with " +
          "default editor configuration for Deno.",
        { width: DEFAULT_WRAP_WIDTH },
      )
    }`;
  } else {
    // If they aren't using the default for the editor file template they
    // probably know what this means
    return "Would you like `vt` to add editor files to this val?";
  }
}

export const toListBranchesCmdMsg = "Use `vt branch` to list branches.";
