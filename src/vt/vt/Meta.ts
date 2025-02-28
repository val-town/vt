import { CONFIG_FILE_NAME, CONFIG_FOLDER_NAME } from "~/consts.ts";
import z from "zod";

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
  public async readConfig(): Promise<z.infer<typeof VTMetaConfigJsonSchema>> {
    try {
      const data = await Deno.readTextFile(this.configFilePath);
      const parsedData = JSON.parse(data);

      const result = VTMetaConfigJsonSchema.safeParse(parsedData);
      if (result.success) {
        return result.data;
      } else {
        console.error("Invalid schema format");
        throw new Error("Invalid schema format");
      }
    } catch (error) {
      console.error("Error loading schema:", error);
      throw error;
    }
  }

  /**
   * Writes updated configuration data to the configuration file.
   *
   * @param updatedSchema - The updated configuration data to be written.
   * @returns A promise that resolves when the file has been successfully written.
   * @throws Will log an error if the file cannot be written.
   */
  public async writeConfig(
    updatedSchema: z.infer<typeof VTMetaConfigJsonSchema>,
  ): Promise<void> {
    try {
      await Deno.mkdir(`${this.rootPath}/${CONFIG_FOLDER_NAME}`, {
        recursive: true,
      });
      const data = JSON.stringify(updatedSchema, null, 2);
      await Deno.writeTextFile(this.configFilePath, data);
    } catch (error) {
      console.error("Error updating schema:", error);
    }
  }
}
