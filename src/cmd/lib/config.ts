import { Command } from "@cliffy/command";
import VTConfig from "~/vt/config.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import { getNestedProperty, setNestedProperty } from "~/utils.ts";
import { stringify as stringifyYaml } from "@std/yaml";
import { VTConfigSchema } from "~/vt/vt/schemas.ts";
import { zodToJsonSchema } from "zod-to-json-schema";
import { printYaml } from "~/cmd/styles.ts";
import { fromError } from "zod-validation-error";
import z from "zod";
import { colors } from "@cliffy/ansi/colors";

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

export const configSetCmd = new Command()
  .description("Set a configuration value")
  .option("--global", "Set in the global configuration")
  .arguments("<key:string> <value:string>")
  .example(
    "Set your valtown API key",
    "vt config set apiKey vtwn_notRealnotRealnotRealnotReal",
  )
  .example(
    "Set whether to prompt for dangerous actions",
    "vt config set dangerousOperations.confirmation false",
  )
  .action(
    async ({ global }: { global?: boolean }, key: string, value: string) => {
      await doWithSpinner("Updating configuration...", async (spinner) => {
        // Check if we're in a Val Town project directory
        const vtRoot = await findVtRoot(Deno.cwd()).catch((e) => {
          if (e instanceof Deno.errors.NotFound) return undefined;
          else throw e;
        });

        const useGlobal = global || !vtRoot;
        const vtConfig = new VTConfig(vtRoot);

        const config = await vtConfig.loadConfig();
        const updatedConfig = setNestedProperty(config, key, value);
        const oldProperty = getNestedProperty(config, key, value) as
          | string
          | undefined;

        if (oldProperty && oldProperty === value) {
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
        } catch (e) {
          if (e instanceof z.ZodError) {
            throw new Error(
              "Invalid input provided! \n" +
                colors.red(fromError(e).toString()),
            );
          } else throw e;
        }
      });
    },
  );

export const configGetCmd = new Command()
  .description("Get a configuration value")
  .arguments("[key]")
  .action(async (_: unknown, key?: string) => {
    await doWithSpinner("Retreiving configuration...", async (spinner) => {
      // Check if we're in a Val Town project directory
      const vtRoot = await findVtRoot(Deno.cwd()).catch((e) => {
        if (e instanceof Deno.errors.NotFound) return undefined;
        else throw e;
      });

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
  .command("options", configOptionsCmd);
