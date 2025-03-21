import type z from "zod";
import { VTMetaConfigJsonSchema } from "~/vt/vt/schemas.ts";
import {
  ALWAYS_IGNORE_PATTERNS,
  CONFIG_FILE_NAME,
  META_FOLDER_NAME,
  META_LOCK_FILE_NAME,
} from "~/consts.ts";
import * as path from "@std/path";
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
   * Gets the full path to all ignore files.
   *
   * @returns {string} The full file path as a string.
   */
  public get ignoreFilesPaths(): string[] {
    return [path.join(this.#rootPath, ".vtignore")];
  }

  /**
   * Gets the full path to the (maybe present) lock file.
   *
   * The lock file contains the PID of a running (watching) vt process, if
   * there is one. Otherwise no file will exist at this path.
   *
   * @return {string} The VT lock file path.
   */
  public lockFilePath(): string {
    return path.join(this.#rootPath, META_FOLDER_NAME, META_LOCK_FILE_NAME);
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
    await ensureDir(path.join(this.#rootPath, META_FOLDER_NAME));
    const data = JSON.stringify(config, null, 2);
    await Deno.writeTextFile(this.configFilePath, data);
  }

  /**
   * Loads the ignore list of globs from ignore files.
   *
   * @returns {Promise} A promise that resolves with a list of glob strings.
   */
  public async loadGitignoreRules(): Promise<string[]> {
    const gitignoreRules: string[] = [];

    for (const filePath of this.ignoreFilesPaths) {
      try {
        // Read the ignore file
        const content = await Deno.readTextFile(filePath);

        const lines = content
          .split("\n") // split by newline
          .map((line) => line.trim()) // get rid of whitespace
          .filter((line) => line && !line.startsWith("#")); // remove empty and commented lines

        // Add all the processed lines from this file to the gitignore rule list
        lines.forEach((line) => gitignoreRules.push(line));
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          console.log(`The file ${filePath} was not found`);
        } else {
          throw error;
        }
        console.log(`Error loading ${filePath}, skipping`);
      }
    }

    // Apply the always ignore patterns last since git ignores have more
    // priority the lower down they are.
    return [...gitignoreRules, ...ALWAYS_IGNORE_PATTERNS];
  }

  /**
   * Create a lock file with a PID of the VT process watching the cloned active
   * directory.
   *
   * @return {Promise<string|null>} A promise resolving to the PID of the running watcher, or null if no watchers are running
   */
  public async getLockFile(): Promise<string | null> {
    try {
      return await Deno.readTextFile(this.lockFilePath());
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return null;
      else throw error;
    }
  }

  /**
   * Set a lock file with the PID of the VT process watching the cloned active
   * directory.
   */
  public async setLockFile() {
    // Make sure the program isn't already running
    const runningPid = await this.getLockFile();
    try {
      if (runningPid !== null) Deno.kill(parseInt(runningPid));
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        // We couldn't kill the process, but that just means that the lock file
        // probably was not up to date and had an already-dead process in it.
        // We can ignore this error.
      } else throw e;
    }

    await Deno.writeTextFile(this.lockFilePath(), Deno.pid.toString());
  }

  /**
   * Delete the vt lock file.
   */
  public async rmLockFile() {
    await Deno.remove(this.lockFilePath());
  }
}
