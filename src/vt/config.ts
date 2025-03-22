import {
  GLOBAL_VT_CONFIG_PATH,
  JSON_INDENT_SPACES,
  META_FOLDER_NAME,
  VT_CONFIG_FILE_NAME,
} from "~/consts.ts";
import * as path from "@std/path";
import { ensureDir, exists } from "@std/fs";
import type { VTConfigSchema } from "~/vt/vt/schemas.ts";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";

// @deno-types="https://cdn.skypack.dev/@types/lodash?dts"
import _ from "lodash";
import type z from "zod";

/**
 * The VTConfig class manages configuration files for VT and provides
 * abstractions to load and retrieve configuration settings.
 */
export default class VTConfig {
  /**
   * Creates an instance of VTConfig.
   *
   * @param {string} rootPath - The root path where the configuration is located.
   */
  #rootPath: string;

  constructor(rootPath: string) {
    this.#rootPath = rootPath;
  }

  /**
   * Gets the full path to the local configuration file.
   *
   * @returns {string} The full file path as a string.
   */
  public getLocalConfigPath(): string {
    return path.join(
      this.#rootPath,
      META_FOLDER_NAME,
      VT_CONFIG_FILE_NAME,
    );
  }

  /**
   * Gets the full path to the global configuration file.
   *
   * @returns {string} The full file path as a string.
   */
  public getGlobalConfigPath(): string {
    return path.join(GLOBAL_VT_CONFIG_PATH, VT_CONFIG_FILE_NAME);
  }

  /**
   * Gets the full path to all configuration files, in decreasing precedence.
   *
   * @returns {Promise<string[]>} Array of full file paths as strings.
   */
  public async getConfigFilePaths(): Promise<string[]> {
    const localPath = this.getLocalConfigPath();
    const globalPath = this.getGlobalConfigPath();

    const configPaths = [];

    // Add global config if it exists
    if (await exists(globalPath)) {
      configPaths.push(globalPath);
    }

    // Add local config if it exists
    if (await exists(localPath)) {
      configPaths.push(localPath);
    }

    return configPaths;
  }

  /**
   * Loads and merges all configuration files using Lodash's merge.
   *
   * @returns {Promise<z.infer<typeof VTConfigSchema>>} A promise that resolves with the merged configuration.
   * @throws {Error} Will throw an error if the files cannot be read or parsed.
   */
  public async loadConfig(): Promise<z.infer<typeof VTConfigSchema>> {
    const configPaths = await this.getConfigFilePaths();
    let mergedConfig: Record<string, unknown> = {};

    for (const configPath of configPaths) {
      try {
        const data = await Deno.readTextFile(configPath);
        // Parse the YAML data instead of JSON
        const parsedData = parseYaml(data);

        // Use lodash merge for deep merging of configuration objects
        mergedConfig = _.merge({}, mergedConfig, parsedData);
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) continue;
        else if (e instanceof Error) {
          throw new Error(
            `Failed to load config from ${configPath}: ${e.message}`,
          );
        } else throw e;
      }
    }

    return mergedConfig as z.infer<typeof VTConfigSchema>;
  }

  /**
   * Saves configuration to the local configuration file.
   *
   * @param {Record<string, unknown>} config - The configuration to save.
   * @returns {Promise<void>} A promise that resolves when the configuration has been saved.
   * @throws {Error} Will throw an error if the file cannot be written.
   */
  public async saveLocalConfig(config: Record<string, unknown>): Promise<void> {
    // Ensure the metadata directory exists
    await ensureDir(path.join(this.#rootPath, META_FOLDER_NAME));

    // Write the configuration to file as YAML
    await Deno.writeTextFile(
      this.getLocalConfigPath(),
      stringifyYaml(config, { indent: JSON_INDENT_SPACES }),
    );
  }
}
