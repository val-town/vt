import z from "zod";

export const CONFIG_FILE_NAME = "config.json";
export const CONFIG_FOLDER_NAME = ".vt";
export const CONFIG_IGNORE_FILE = ".vtignore";

export const VTMetaConfigJsonSchema = z.object({
  projectId: z.string().uuid(),
  currentBranch: z.string().uuid(),
  version: z.number().gte(0),
});

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
  constructor(private rootPath: string) {}

  /**
   * Gets the full path to the configuration file.
   *
   * @returns The full file path as a string.
   */
  public get configFilePath() {
    return `${this.rootPath}/${CONFIG_FOLDER_NAME}/${CONFIG_FILE_NAME}`;
  }

  /**
   * Reads and parses the configuration file.
   *
   * @returns A promise that resolves with the parsed configuration data.
   * @throws Will throw an error if the file cannot be read or parsed.
   */
  public async getConfig(): Promise<z.infer<typeof VTMetaConfigJsonSchema>> {
    const data = await this.readFile(this.configFilePath);
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
      await Deno.mkdir(`${this.rootPath}/${CONFIG_FOLDER_NAME}`, {
        recursive: true,
      });
      const data = JSON.stringify(config, null, 2);
      await Deno.writeTextFile(this.configFilePath, data);
    } catch (error) {
      console.error("Error updating schema:", error);
    }
  }

  /**
   * Loads the ignore list from ignore files.
   *
   * @param ignoreFiles - An array of file names to load ignore patterns from.
   * @returns A promise that resolves when the ignore list has been loaded.
   */
  private async getIgnorePredicate(
    ignoreFiles: string[] = [CONFIG_IGNORE_FILE],
  ): Promise<() => boolean> {
    const ignoreList: RegExp[] = [];

    for (const file of ignoreFiles) {
      try {
        const content = await this.readFile(file);
        const lines = content.split("\n").map((line) => line.trim()).filter((
          line,
        ) => line && !line.startsWith("#"));
        ignoreList.push(...lines.map((pattern) => new RegExp(pattern)));
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          console.error(`The file ${file} was not found`);
        } else {
          throw error;
        }
        console.log(`Error loading ${file}, skipping`);
      }
    }

    return () => ignoreList.every((pattern) => pattern.test);
  }

  /**
   * Reads a file and returns its content.
   *
   * @param path - The path to the file.
   * @returns A promise that resolves with the file content.
   */
  private async readFile(path: string): Promise<string> {
    try {
      return await Deno.readTextFile(path);
    } catch (error) {
      console.error("Error loading internal vt config file:", error);
      throw error;
    }
  }

}
