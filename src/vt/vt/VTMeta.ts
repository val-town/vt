import z from "zod";
import { VTMetaConfigJsonSchema } from "~/vt/vt/schemas.ts";
import { CONFIG_FILE_NAME, META_FOLDER_NAME } from "~/consts.ts";
import * as path from "@std/path";
import { stash, StashListingInfo } from "~/vt/git/stash.ts";
import { ensureDir } from "@std/fs";

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
   * Gets the path to the stash directory under .vt
   *
   * @returns {string} The full path to the stash directory
   */
  private get stashDirPath(): string {
    return path.join(this.#rootPath, META_FOLDER_NAME, "stash");
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
   * Loads the ignore list list of globs from ignore files.
   *
   * @returns {Promise} A promise that resolves with a list of glob strings.
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

  /**
   * Lists all project snapshots in the stash directory.
   *
   * @returns Promise resolving to array of StashListingInfo
   */
  public async stash(
    mode: "list",
  ): Promise<StashListingInfo[]>;

  /**
   * Manages project snapshots using stash operations.
   *
   * @param mode - The stash operation mode (store/apply/delete)
   * @param name - Name for the stash (required)
   * @param ignoreGlobs - Optional glob patterns to ignore during operations
   * @returns Promise resolving to StashListingInfo
   */
  public async stash(
    mode: "store" | "apply" | "delete",
    name: string,
    ignoreGlobs?: string[],
  ): Promise<StashListingInfo>;

  public async stash(
    mode: "store" | "apply" | "delete" | "list",
    name?: string,
    ignoreGlobs?: string[],
  ): Promise<StashListingInfo | StashListingInfo[]> {
    await ensureDir(this.stashDirPath);

    if (mode === "list") {
      return stash({
        projectDir: this.#rootPath,
        stashDir: this.stashDirPath,
        mode: "list",
      });
    }

    if (!name) {
      throw new Error(`Name is required for ${mode} operation`);
    }

    return stash({
      projectDir: this.#rootPath,
      stashDir: this.stashDirPath,
      name,
      mode,
      ignoreGlobs,
    });
  }
}
