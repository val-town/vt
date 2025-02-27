import { z } from "zod";
import VT from "~/vt/Vt.ts";

const ConfigJson = z.object({
  projectId: z.string().uuid(),
  currentBranch: z.string().uuid(),
  version: z.number().gte(0),
});

type ConfigJsonType = z.infer<typeof ConfigJson>;

/**
 * Abstraction for manipulating the .vit folder.
 */
export default class MetaFolder {
  config: ConfigJsonType | null = null;

  constructor(public readonly vit: VT) {
    this.init();
  }

  /**
   * Set up the .vt/config.json
   */
  private async init() {
    const path = this.getPath();
    try {
      await Deno.stat(`${path}/config.json`);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // Create a default config.json if it does not exist
        const defaultConfig: ConfigJsonType = {
          projectId: "00000000-0000-0000-0000-000000000000", // placeholder UUID
          currentBranch: "00000000-0000-0000-0000-000000000000", // placeholder UUID
          version: 1,
        };
        await this.update(defaultConfig);
      } else {
        console.error("Error during initialization:", error);
      }
    }
  }

  /**
   * Helper function to get the root path of the vit project.
   * @returns {string} The root path of the vit project.
   */
  private getPath(): string {
    return this.vit.rootPath;
  }

  /**
   * Loads the schema from the `.vit` folder.
   * Reads the schema JSON file and validates it against the DotVT type.
   *
   * @returns {Promise<ConfigJsonType | null>} A promise that resolves to the schema object if valid, or null if invalid or an error occurs.
   */
  async load(): Promise<ConfigJsonType | null> {
    try {
      const path = this.getPath();
      const data = await Deno.readTextFile(`${path}/config.json`);
      const parsedData = JSON.parse(data);

      const result = ConfigJson.safeParse(parsedData);
      if (result.success) {
        this.config = result.data; // Sync the in-memory representation
        return this.config;
      } else {
        console.error("Invalid schema format");
        return null;
      }
    } catch (error) {
      console.error("Error loading schema:", error);
      return null;
    }
  }

  /**
   * Updates the schema file in the `.vit` folder.
   * Writes the provided schema object to the schema JSON file.
   *
   * @param {ConfigJsonType} updatedSchema - The updated schema object to be written to the file.
   * @returns {Promise<void>} A promise that resolves when the schema has been successfully written.
   */
  async update(updatedSchema: ConfigJsonType): Promise<void> {
    try {
      const path = this.getPath();
      const data = JSON.stringify(updatedSchema, null, 2);
      await Deno.writeTextFile(`${path}/config.json`, data);
      this.config = updatedSchema; // Sync the in-memory representation
    } catch (error) {
      console.error("Error updating schema:", error);
    }
  }
}
