import { Command } from "@cliffy/command";
import VTConfig from "~/vt/config.ts";
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

function showConfigOptions() {
  // deno-lint-ignore no-explicit-any
  const jsonSchema = zodToJsonSchema(VTConfigSchema) as any;
  delete jsonSchema["$schema"];
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
  .action(
    async ({ global }: { global: boolean }, key: string, value: string) => {
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

        try {
          if (useGlobal) {
            await vtConfig.saveGlobalConfig(updatedConfig);
            spinner.succeed(`Set "${key}"="${value}" in global configuration`);
          } else {
            await vtConfig.saveLocalConfig(updatedConfig);
            spinner.succeed(`Set "${key}"="${value}" in local configuration`);
          }
        } catch (e) {
          if (e instanceof z.ZodError) {
            console.error(
              colors.red("Invalid input provided! " + fromError(e)),
            );
          }
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
  .description("Manage vt configuration")
  .command("set", configSetCmd)
  .command("get", configGetCmd)
  .command("options", configOptionsCmd)
  .action(showConfigOptions);
