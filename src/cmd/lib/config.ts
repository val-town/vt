import { Command } from "@cliffy/command";
import VTConfig, { globalConfig } from "~/vt/VTConfig.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import { setNestedProperty } from "~/utils.ts";
import { stringify as stringifyYaml } from "@std/yaml";
import { VTConfigSchema } from "~/vt/vt/schemas.ts";
import { zodToJsonSchema } from "zod-to-json-schema";
import { printYaml } from "~/cmd/styles.ts";
import { fromError } from "zod-validation-error";
import z from "zod";
import { colors } from "@cliffy/ansi/colors";
import {
  DEFAULT_WRAP_AMOUNT,
  GLOBAL_VT_CONFIG_PATH,
  LOCAL_VT_CONFIG_PATH,
} from "~/consts.ts";
import { join } from "@std/path";
import wrap from "word-wrap";
import { openEditorAt } from "~/cmd/lib/utils/openEditorAt.ts";
import { Confirm, Select } from "@cliffy/prompt";
import { execSync } from "node:child_process";

function showConfigOptions() {
  // deno-lint-ignore no-explicit-any
  const jsonSchema = zodToJsonSchema(VTConfigSchema) as any;
  delete jsonSchema["$schema"];

  // deno-lint-ignore no-explicit-any
  const removeAdditionalProperties = (obj: any) => {
    if (obj && typeof obj === "object") {
      delete obj.additionalProperties;

      // Recursively process nested objects
      for (const key in obj) {
        if (typeof obj[key] === "object" && obj[key] !== null) {
          removeAdditionalProperties(obj[key]);
        }
      }
    }
  };

  removeAdditionalProperties(jsonSchema);

  console.log(colors.green("All available options:"));
  console.log();
  printYaml(stringifyYaml(jsonSchema["properties"]));
}

/**
 * If the user tries to add an API secret to their local vt config file, offer
 * to add the config file to their local gitignore.
 */
async function offerToAddToGitignore() {
  // Check if we're in a git repository
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    const addToIgnore = await Confirm.prompt(
      "You are adding an API secret to your local config file, and we noticed you have a Git repo set up for this folder.\n" +
        `Would you like to add \`${LOCAL_VT_CONFIG_PATH}\`. to your \`.gitignore\`?`,
    );

    if (addToIgnore) {
      let gitignoreContent = "";
      try {
        gitignoreContent = await Deno.readTextFile(join(gitRoot, ".gitignore"));
      } catch (e) {
        if (e instanceof Deno.errors.AlreadyExists) {
          // ignore, we will create
        } else throw e;
      }
      gitignoreContent += LOCAL_VT_CONFIG_PATH;
      await Deno.writeTextFile(join(gitRoot, ".gitignore"), gitignoreContent);
    }
  } catch {
    // Not in a git repository, skip
  }
}

export const configWhereCmd = new Command()
  .name("where")
  .description("Show the config file locations")
  .action(async () => {
    // Find project root, if in a Val Town project
    let vtRoot: string | undefined = undefined;
    try {
      vtRoot = await findVtRoot(Deno.cwd());
    } catch (_) {
      // ignore not found
    }

    // Local config is always in <root>/.vt/config.yaml
    const localConfigPath = vtRoot
      ? join(vtRoot, ".vt", "config.yaml")
      : undefined;

    // Just print the resolved paths, always global first, then local if it exists
    if (GLOBAL_VT_CONFIG_PATH) {
      console.log(GLOBAL_VT_CONFIG_PATH);
    }
    if (localConfigPath) {
      console.log(localConfigPath);
    }
  });

export const configSetCmd = new Command()
  .description("Set a configuration value")
  .option("--local", "Set in the local configuration (val-specific)")
  .arguments("<key:string> <value:string>")
  .example(
    "Set your valtown API key (global)",
    "vt config set apiKey vtwn_notRealnotRealnotRealnotReal",
  )
  .example(
    "Set whether to prompt for dangerous actions (local)",
    "vt config set --local dangerousOperations.confirmation false",
  )
  .action(
    async ({ local }: { local?: boolean }, key: string, value: string) => {
      await doWithSpinner("Updating configuration...", async (spinner) => {
        // Check if we're in a Val Town Val directory
        const vtRoot = await findVtRoot(Deno.cwd()).catch(() => undefined);

        const useGlobal = !local;
        const vtConfig = new VTConfig(vtRoot);

        const config = await vtConfig.loadConfig();
        const updatedConfig = setNestedProperty(config, key, value);
        const oldProperty = getNestedProperty(config, key, null) as
          | string
          | null;

        if (oldProperty !== null && oldProperty.toString() === value) {
          throw new Error(
            `Property ${colors.bold(key)} is already set to ${
              colors.bold(oldProperty)
            }`,
          );
        }

        let validatedConfig: z.infer<typeof VTConfigSchema>;
        try {
          if (useGlobal) {
            validatedConfig = await vtConfig.saveGlobalConfig(updatedConfig);
          } else {
            validatedConfig = await vtConfig.saveLocalConfig(updatedConfig);
          }

<<<<<<< Updated upstream
          if (JSON.stringify(config) !== JSON.stringify(validatedConfig)) {
            spinner.succeed(
              `Set ${colors.bold(`${key}=${value}`)} in ${
                useGlobal ? "global" : "local"
              } configuration`,
            );
          } else {
            throw new Error(
              `Property ${colors.bold(key)} is not valid.` +
                `\n  Use \`${
                  colors.bold("vt config options")
                }\` to view config options`,
            );
          }
=======
          if (key === "apiKey") {
            await offerToAddToGitignore();
          }

          spinner.succeed(
            `Set ${colors.bold(`${key}=${value}`)} in ${
              colors.bold(useGlobal ? "global" : "local")
            } configuration`,
          );
>>>>>>> Stashed changes
        } catch (e) {
          if (e instanceof z.ZodError) {
            throw new Error(
              "Invalid input provided! \n" +
                wrap(colors.red(fromError(e).toString()), {
                  width: DEFAULT_WRAP_AMOUNT,
                }),
            );
          } else throw e;
        }
      });
    },
  );

export const configGetCmd = new Command()
  .description("Get a configuration value")
  .arguments("[key]")
  .alias("show")
  .example("Display current configuration", "vt config get")
  .example("Display the API key", "vt config get apiKey")
  .action(async (_: unknown, key?: string) => {
    await doWithSpinner("Retreiving configuration...", async (spinner) => {
      // Check if we're in a Val Town Val directory
      const vtRoot = await findVtRoot(Deno.cwd()).catch(() => undefined);

      // Create config instance with the appropriate path
      const config = new VTConfig(vtRoot);

      // Load configuration
      const currentConfig = await config.loadConfig();
      if (key) {
        // So we can directly index into it, cast it to a Record<string, unknown>
        const configAny = currentConfig as Record<string, unknown>;
        if (key in configAny) {
          const value = String(configAny[key]);
          spinner.succeed("Retrieved configuration");
          console.log();
          console.log(value);
        } else {
          spinner.warn(`Key "${key}" not found in configuration`);
        }
      } else {
        // Display all configuration if no key specified
        spinner.succeed("Retrieved all configuration");
        console.log();
        printYaml(stringifyYaml(currentConfig, { indent: 2 }));
      }
    });
  });

export const configIgnoreCmd = new Command()
  .name("ignore")
  .description("Edit or display the global vtignore file")
  .option("--no-editor", "Do not open the editor, just display the file path")
  .action(async ({ editor }: { editor?: boolean }) => {
    const { globalIgnoreFiles } = await globalConfig.loadConfig();

    if (!globalIgnoreFiles || globalIgnoreFiles.length === 0) {
      console.log("No global ignore files found");
      Deno.exit(1);
    }

    let globalIgnorePath: string;

    if (globalIgnoreFiles.length === 1) {
      globalIgnorePath = globalIgnoreFiles[0];
    } else {
      // Use Select prompt if multiple files are available
      globalIgnorePath = await Select.prompt({
        message: "Select a vtignore file to edit or display",
        options: globalIgnoreFiles.map((file) => ({ name: file, value: file })),
      });
    }

    if (!editor) console.log(globalIgnorePath);
    else {
      const editor = Deno.env.get("EDITOR");
      if (editor) {
        await openEditorAt(globalIgnorePath);
      } else {
        console.log(globalIgnorePath);
      }
    }
  });

export const configOptionsCmd = new Command()
  .name("options")
  .description("List all available configuration options")
  .action(showConfigOptions);

// Add subcommands to the main config command
export const configCmd = new Command()
  .name("config")
  .action(showConfigOptions)
  .description("Manage vt configuration")
  .command("set", configSetCmd)
  .command("get", configGetCmd)
  .command("ignore", configIgnoreCmd)
  .command("where", configWhereCmd)
  .command("options", configOptionsCmd);
