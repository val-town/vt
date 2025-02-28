import { join } from "@std/path";
import z from "zod";
import { VTMetaConfigJsonSchema } from "~/vt/vt/schemas.ts";

export const CONFIG_FILE_NAME = "config.json";
export const CONFIG_FOLDER_NAME = ".vt";
export const CONFIG_IGNORE_FILE = ".vtignore";

/**
 * ConfigFolder class for managing the .vt/config.json configuration file.
 *
 * Automatically serialize and deserialize the contents of `config.json`.
 */
export default class VTMeta {
  /**
   * Creates an instance of ConfigFolder.
   *
   * @param rootPath - The root path where the configuration folder is located.
   */
  #rootPath: string;

  constructor(rootPath: string) {
    this.#rootPath = rootPath;
  }

  /**
   * Gets the full path to the configuration file.
   *
   * @returns The full file path as a string.
   */
  public get configFilePath() {
    return join(this.#rootPath, CONFIG_FOLDER_NAME, CONFIG_FILE_NAME);
  }

  /**
   * Reads and parses the configuration file.
   *
   * @returns A promise that resolves with the parsed configuration data.
   * @throws Will throw an error if the file cannot be read or parsed.
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
   * @param config - The updated configuration data to be written.
   * @returns A promise that resolves when the file has been successfully written.
   * @throws Will log an error if the file cannot be written.
   */
  public async saveConfig(
    config: z.infer<typeof VTMetaConfigJsonSchema>,
  ): Promise<void> {
    try {
      await Deno.mkdir(join(this.#rootPath, CONFIG_FOLDER_NAME), {
        recursive: true,
      });
      const data = JSON.stringify(config, null, 2);
      await Deno.writeTextFile(this.configFilePath, data);
    } catch (error) {
      console.error("Error updating schema:", error);
    }
  }

  /**
   * Loads the ignore list list of globs from ignore files.
   *
   * @param ignoreGlobs An array of file names to load ignore globs from.
   * @returns A promise that resolves with a list of glob strings.
   */
  public async loadIgnoreGlobs(): Promise<string[]> {
    const ignoreGlobs: string[] = [];

    for (const file of ignoreGlobs) {
      try {
        // Read the ignore file
        const content = await Deno.readTextFile(file);

        const lines = content
          .split("\n") // split by newline
          .map((line) => line.trim()) // get rid of whitespace
          .filter((line) => line && !line.startsWith("#")); // commented lines

        // Add all the processed lines from this file to the ignore globs list
        lines.forEach((line) => ignoreGlobs.push(line));
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          console.log(`The file ${file} was not found`);
        } else {
          throw error;
        }
        console.log(`Error loading ${file}, skipping`);
      }
    }

    return ignoreGlobs;
  }
}
