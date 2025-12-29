import { deepMerge } from "@std/collections/deep-merge";
import {
  API_KEY_KEY,
  GLOBAL_VT_CONFIG_PATH,
  JSON_INDENT_SPACES,
  META_FOLDER_NAME,
  VT_CONFIG_FILE_NAME,
} from "~/consts.ts";
import * as path from "@std/path";
import { ensureDir, exists } from "@std/fs";
import {
  DefaultVTConfig,
  VTConfigSchema,
  VTConfigSchemaOverlay,
} from "~/vt/vt/schemas.ts";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import type z from "zod";
import { findVtRoot } from "~/vt/vt/utils.ts";

/**
 * The VTConfig class manages configuration files for VT and provides
 * abstractions to load and retrieve configuration settings.
 */
export default class VTConfig {
  /**
   * Creates an instance of VTConfig.
   *
   * @param localConfigPath Path where the local configuration is stored.
   */
  #localConfigPath: string;

  constructor(localConfigPath?: string) {
    this.#localConfigPath = localConfigPath || Deno.cwd();
  }

  /**
   * Gets the full path to the local configuration file.
   *
   * @returns The full file path as a string.
   */
  public getLocalConfigPath(): string {
    return path.join(
      this.#localConfigPath,
      META_FOLDER_NAME,
      VT_CONFIG_FILE_NAME,
    );
  }

  /**
   * Whether a local configuration file exists.
   *
   * @returns Promise that resolves to true if the file exists, false otherwise.
   */
  public async localConfigExists(): Promise<boolean> {
    return await exists(this.getLocalConfigPath());
  }

  /**
   * The full path to the global configuration file.
   *
   * @returns The full file path to the global configuration file.
   */
  public getGlobalConfigPath(): string {
    return path.join(GLOBAL_VT_CONFIG_PATH, VT_CONFIG_FILE_NAME);
  }

  /**
   * The full path to all configuration files, in decreasing precedence.
   *
   * @returns Array of full file paths as strings.
   */
  public async getConfigFilePaths(): Promise<string[]> {
    const localPath = this.getLocalConfigPath();
    const globalPath = this.getGlobalConfigPath();

    const configPaths = [];

    // Add global config if it exists
    if (await exists(globalPath)) configPaths.push(globalPath);

    // Add local config if it exists
    if (await exists(localPath)) configPaths.push(localPath);

    return configPaths;
  }

  /**
   * Loads and merges all configuration files.
   *
   * @returns Promise that resolves with the merged configuration.
   * @throws {Error} If files cannot be read or parsed.
   */
  public async loadConfig(): Promise<z.infer<typeof VTConfigSchema>> {
    const configPaths = await this.getConfigFilePaths();
    let mergedConfig: Record<string, unknown> = {};

    for (const configPath of configPaths) {
      try {
        const data = await Deno.readTextFile(configPath);
        const yamlData = parseYaml(data);
        const yamlConfig = VTConfigSchema.partial().parse(yamlData);
        mergedConfig = deepMerge(mergedConfig, yamlConfig);
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) continue;
        else if (e instanceof Error) {
          throw new Error(
            `Failed to load config from ${configPath}: ${e.message}`,
          );
        } else throw e;
      }
    }

    // Validate the final merged config against the schema
    return VTConfigSchema.parse(mergedConfig);
  }

  /**
   * Saves configuration to the local configuration file.
   *
   * @param config The configuration to save.
   * @returns Promise that resolves with the validated configuration.
   */
  public async saveLocalConfig(
    config: Record<string, unknown>,
  ): Promise<z.infer<typeof VTConfigSchemaOverlay>> {
    // Validate the configuration against the schema
    const validatedConfig = VTConfigSchemaOverlay.parse(config);

    // Ensure the metadata directory exists
    await ensureDir(path.join(this.#localConfigPath, META_FOLDER_NAME));

    // Write the configuration to file as YAML
    await Deno.writeTextFile(
      this.getLocalConfigPath(),
      stringifyYaml(validatedConfig, { indent: JSON_INDENT_SPACES }),
    );

    return validatedConfig;
  }

  /**
   * Saves configuration to the global configuration file.
   *
   * @param config Configuration to save.
   * @returns A promise that resolves with the validated configuration.
   */
  public async saveGlobalConfig(
    config: Record<string, unknown>,
  ): Promise<z.infer<typeof VTConfigSchema>> {
    // Validate the configuration against the schema
    const validatedConfig = VTConfigSchema.strict().parse(config);

    // Ensure the global configuration directory exists
    await ensureDir(GLOBAL_VT_CONFIG_PATH);

    // Write the configuration to file as YAML
    await Deno.writeTextFile(
      this.getGlobalConfigPath(),
      stringifyYaml(validatedConfig, { indent: JSON_INDENT_SPACES }),
    );

    return validatedConfig;
  }
}

/**
 * Create the global VTConfig file (~/.config/vt/config.yaml) if it doesn't
 * exist.
 *
 * @returns A promise that resolves when the config file is ensured.
 */
export async function ensureGlobalVtConfig(): Promise<void> {
  const configFilePath = path.join(GLOBAL_VT_CONFIG_PATH, VT_CONFIG_FILE_NAME);

  if (!await exists(configFilePath)) {
    await ensureDir(GLOBAL_VT_CONFIG_PATH);
    const startingConfig = DefaultVTConfig;

    // If we can find `VAL_TOWN_API_KEY` in the environment, add it
    // automatically (the config file didn't previously exist so we shouldn't
    // be overwriting anything)
    if (Deno.env.has(API_KEY_KEY)) {
      const apiKey = Deno.env.get(API_KEY_KEY)!; // (!, we just checked)
      if (apiKey.length == 32 || apiKey.length == 33) {
        startingConfig.apiKey = apiKey;
      } else startingConfig.apiKey = "0".repeat(32);
    }

    await Deno.writeTextFile(
      configFilePath,
      stringifyYaml(startingConfig, { indent: JSON_INDENT_SPACES }),
    );
  }
}

export const globalConfig = new VTConfig(
  await findVtRoot(Deno.cwd()).catch(() => undefined),
);
