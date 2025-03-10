import z from "zod";
import { VTMetaConfigJsonSchema } from "~/vt/vt/schemas.ts";
import { CONFIG_FILE_NAME, META_FOLDER_NAME } from "~/consts.ts";
import * as path from "@std/path";

/**
 * The VTMeta class manages .vt/* configuration files and provides abstractions
 * to mutate and retreive them. Used internally by VTClient.
 */
export default class VTMeta {
  /**
   * Creates an instance of VTMeta.
   *
   * @param {string} rootPath - The root path where the configuration folder is located.
   */
  #rootPath: string;

  constructor(rootPath: string) {
    this.#rootPath = rootPath;
  }

  /**
   * Gets the full path to the configuration file.
   *
   * @returns {string} The full file path as a string.
   */
  public get configFilePath(): string {
    return path.join(this.#rootPath, META_FOLDER_NAME, CONFIG_FILE_NAME);
  }

  /**
   * Gets the full path to all ignore files.
   *
   * @returns {string} The full file path as a string.
   */
  public get ignoreFilesPaths(): string[] {
    return [path.join(this.#rootPath, ".vtignore")];
  }

  /**
   * Reads and parses the configuration file.
   *
   * @returns {Promise} A promise that resolves with the parsed configuration data.
   * @throws {Error} Will throw an error if the file cannot be read or parsed.
   */
  public async loadConfig(): Promise<z.infer<typeof VTMetaConfigJsonSchema>> {
    const data = await Deno.readTextFile(this.configFilePath);
    const parsedData = JSON.parse(data);

    const result = VTMetaConfigJsonSchema.safeParse(parsedData);
    if (!result.success) {
      console.error("Invalid schema format");
      throw new Error("Invalid schema format");
    }

    return result.data;
  }

  /**
   * Writes updated configuration data to the configuration file.
   *
   * @param config - Updated configuration data to be written.
   * @returns {Promise} Promise that resolves when the file has been successfully written.
   * @throws {Error} File cannot be written.
   */
  public async saveConfig(
    config: z.infer<typeof VTMetaConfigJsonSchema>,
  ): Promise<void> {
    try {
      await Deno.mkdir(path.join(this.#rootPath, META_FOLDER_NAME), {
        recursive: true,
      });
      const data = JSON.stringify(config, null, 2);
      await Deno.writeTextFile(this.configFilePath, data);
    } catch (error) {
      console.error("Error updating schema:", error);
    }
  }

  /**
   * Loads the ignore list of globs from ignore files.
   *
   * @returns {Promise} A promise that resolves with a list of glob strings.
   */
  public async loadIgnoreGlobs(): Promise<string[]> {
    const ignoreGlobs: string[] = [];

    for (const filePath of this.ignoreFilesPaths) {
      try {
        // Read the ignore file
        const content = await Deno.readTextFile(filePath);

        const lines = content
          .split("\n") // split by newline
          .map((line) => line.trim()) // get rid of whitespace
          .filter((line) => line && !line.startsWith("#")); // remove empty and commented lines

        // Add all the processed lines from this file to the ignore globs list
        lines.forEach((line) => ignoreGlobs.push(line));
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          console.log(`The file ${filePath} was not found`);
        } else {
          throw error;
        }
        console.log(`Error loading ${filePath}, skipping`);
      }
    }

    return ignoreGlobs;
  }
}
