import {
  JSON_INDENT_SPACES,
  META_FOLDER_NAME,
  META_IGNORE_FILE_NAME,
  META_STATE_FILE_NAME,
} from "~/consts.ts";
import { ALWAYS_IGNORE_PATTERNS } from "~/consts.ts";
import * as path from "@std/path";
import { ensureDir, walk } from "@std/fs";
import { VTStateSchema } from "~/vt/vt/schemas.ts";
import type { z } from "zod";

// @deno-types="https://cdn.skypack.dev/@types/lodash?dts"
import _ from "lodash";
import type { DeepPartial } from "~/utils.ts";

/**
 * The VTMeta class manages .vt/* configuration files and provides abstractions
 * to mutate and retreive them. It maintains the state of the vt folder. Used
 * internally by VTClient.
 */
export default class VTMeta {
  /**
   * Creates an instance of VTMeta.
   *
   * @param {string} rootPath - The root path where the state folder is located.
   */
  #rootPath: string;

  constructor(rootPath: string) {
    this.#rootPath = rootPath;
  }

  /**
   * Gets the full path to the state file.
   *
   * @returns {string} The full file path as a string.
   */
  public get metaFilePath(): string {
    return path.join(this.#rootPath, META_FOLDER_NAME, META_STATE_FILE_NAME);
  }

  /**
   * Gets the full path to all ignore files.
   *
   * @returns {string[]} Array of full file paths as strings.
   */
  private async gitignoreFilePaths(): Promise<string[]> {
    const ignoreFiles: string[] = [];

    // Walk through all directories recursively starting from root path
    for await (const file of walk(this.#rootPath)) {
      if (path.basename(file.path) === META_IGNORE_FILE_NAME) {
        ignoreFiles.push(file.path);
      }
    }

    // Always include the root meta ignore file if it wasn't found in the walk
    const rootMetaIgnore = path.join(this.#rootPath, META_IGNORE_FILE_NAME);
    if (!ignoreFiles.includes(rootMetaIgnore)) ignoreFiles.push(rootMetaIgnore);

    return ignoreFiles;
  }

  /**
   * Reads and parses the state file.
   *
   * @returns {Promise} A promise that resolves with the parsed state data.
   * @throws {Error} Will throw an error if the file cannot be read or parsed.
   */
  public async loadState(): Promise<z.infer<typeof VTStateSchema>> {
    const data = await Deno.readTextFile(this.metaFilePath);
    const parsedData = JSON.parse(data);
    parsedData.lastRunningPid = Deno.pid; // Update the last running PID

    const result = VTStateSchema.safeParse(parsedData);
    if (!result.success) {
      throw new Error(`.vt/${META_STATE_FILE_NAME} file is of wrong shape`);
    }

    return result.data;
  }

  /**
   * Initializes the state configuration in the metadata file.
   * This method validates the complete state object and writes it to the metadata file,
   * overwriting any existing configuration.
   *
   * @param state - Complete state object to initialize, excluding lastRunningPid
   * @returns Promise that resolves when the configuration has been initialized
   * @throws Will throw if validation fails or if file operations encounter errors
   */
  public async initState(
    state: Omit<z.infer<typeof VTStateSchema>, "lastRunningPid">,
  ): Promise<void> {
    // Validate complete state
    const stateSchema = VTStateSchema.omit({ lastRunningPid: true });
    const validatedState = stateSchema.parse(state);

    // Ensure the metadata directory exists
    await ensureDir(path.join(this.#rootPath, META_FOLDER_NAME));

    // Write the configuration to file
    await Deno.writeTextFile(
      this.metaFilePath,
      JSON.stringify(validatedState, null, JSON_INDENT_SPACES),
    );
  }

  /**
   * Updates the provided state configuration in the metadata file.
   * This method validates the input, merges it with existing configuration,
   * and writes the result back to the metadata file.
   *
   * @param state - Partial state object to update
   * @returns Promise that resolves when the configuration has been updated
   * @throws Will throw if validation fails or if file operations encounter errors
   */
  public async updateState(
    state: DeepPartial<z.infer<typeof VTStateSchema>>,
  ): Promise<void> {
    // Validate input state
    const partialStateSchema = VTStateSchema.partial();
    const validatedState = partialStateSchema.parse(state);

    // Read and merge with existing config
    const existingConfig = JSON.parse(
      await Deno.readTextFile(this.metaFilePath),
    );
    const mergedConfig = _.merge(existingConfig, validatedState);

    // Ensure the metadata directory exists
    await ensureDir(path.join(this.#rootPath, META_FOLDER_NAME));

    // Write the merged configuration to file
    await Deno.writeTextFile(
      this.metaFilePath,
      JSON.stringify(mergedConfig, null, JSON_INDENT_SPACES),
    );
  }

  /**
   * Loads the ignore list of globs from ignore files.
   *
   * @returns {Promise} A promise that resolves with a list of glob strings.
   */
  public async loadGitignoreRules(): Promise<string[]> {
    const gitignoreRules: string[] = [];

    for (const filePath of await this.gitignoreFilePaths()) {
      try {
        const content = await Deno.readTextFile(filePath);

        const lines = content
          .split("\n") // split by newline
          .map((line) => line.trim()) // get rid of whitespace
          .filter((line) => line && !line.startsWith("#")); // remove empty and commented lines

        // Add all the processed lines from this file to the gitignore rule list
        lines.forEach((line) => gitignoreRules.push(line));
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) continue;
        else throw e;
      }
    }

    // Apply the always ignore patterns last since git ignores have more
    // priority the lower down they are.
    return [...gitignoreRules, ...ALWAYS_IGNORE_PATTERNS];
  }
}
