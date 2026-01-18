import {
  JSON_INDENT_SPACES,
  META_FOLDER_NAME,
  META_IGNORE_FILE_NAME,
  META_STATE_FILE_NAME,
} from "~/consts.ts";
import { ALWAYS_IGNORE_PATTERNS } from "~/consts.ts";
import { VTStateSchema } from "~/vt/vt/schemas.ts";
import type { z } from "zod";
import { ensureDir, exists, walk } from "@std/fs";
import { globalConfig } from "~/vt/VTConfig.ts";
import { basename, join } from "@std/path";

/**
 * The VTMeta class manages .vt/* configuration files and provides abstractions
 * to mutate and retrieve them. It maintains the state of the vt folder. Used
 * internally by VTClient.
 */
export default class VTMeta {
  /**
   * Creates an instance of VTMeta.
   *
   * @param rootPath The root path where the state folder is located.
   */
  #rootPath: string;

  constructor(rootPath: string) {
    this.#rootPath = rootPath;
  }

  /**
   * Gets the full path to the state file.
   *
   * @returns The full file path as a string.
   */
  public getVtStateFileName(): string {
    return join(this.#rootPath, META_FOLDER_NAME, META_STATE_FILE_NAME);
  }

  /**
   * Gets the full path to all ignore files.
   *
   * @returns Array of full file paths as strings.
   */
  private async gitignoreFilePaths(): Promise<string[]> {
    const ignoreFiles: string[] = [];

    // Always add the global .vtignore if it exists
    const { globalIgnoreFiles } = await globalConfig.loadConfig();
    for (const filePath of globalIgnoreFiles || []) {
      if (await exists(filePath)) ignoreFiles.push(filePath);
    }

    // Walk through all directories recursively starting from root path
    for await (const file of walk(this.#rootPath)) {
      if (basename(file.path) === META_IGNORE_FILE_NAME) {
        if (await exists(file.path)) ignoreFiles.push(file.path);
      }
    }

    // Always include the root meta ignore file if it wasn't found in the walk
    const rootMetaIgnore = join(this.#rootPath, META_IGNORE_FILE_NAME);
    if (!ignoreFiles.includes(rootMetaIgnore) && await exists(rootMetaIgnore)) {
      ignoreFiles.push(rootMetaIgnore);
    }

    return ignoreFiles;
  }

  /**
   * Reads and parses the state file.
   *
   * @returns A promise that resolves with the parsed state data.
   * @throws Will throw an error if the file cannot be read or parsed.
   */
  public async loadVtState(): Promise<z.infer<typeof VTStateSchema>> {
    const data = await Deno.readTextFile(this.getVtStateFileName());
    const parsedData = JSON.parse(data);
    parsedData.lastRunningPid = Deno.pid; // Update the last running PID

    const result = VTStateSchema.safeParse(parsedData);
    if (!result.success) {
      throw new Error(`.vt/${META_STATE_FILE_NAME} file is of wrong shape`);
    }

    return result.data;
  }

  /**
   * Saves the state state metadata. Automatically updates lastRun info.
   *
   * @param state - Complete state object to save, excluding last run info
   * @returns Promise that resolves when the state data has been saved
   * @throws Will throw if validation fails or if file operations encounter errors
   */
  public async saveVtState(
    state: Omit<z.infer<typeof VTStateSchema>, "lastRun">,
  ): Promise<void> {
    // Validate complete state
    const validatedState: z.infer<typeof VTStateSchema> = VTStateSchema.parse({
      ...state,
      lastRun: {
        time: new Date().toISOString(),
        pid: Deno.pid,
      },
    });

    // Ensure the metadata directory exists
    await ensureDir(join(this.#rootPath, META_FOLDER_NAME));

    // Write the meta to file
    await Deno.writeTextFile(
      this.getVtStateFileName(),
      JSON.stringify(validatedState, null, JSON_INDENT_SPACES),
    );
  }

  /**
   * Performs operations on the configuration and automatically saves it.
   *
   * @param callback A function that receives the current config and can modify it
   * @returns Promise that resolves to the return value of the callback
   * @throws If the config cannot be loaded or saved
   */
  public async doWithVtState<T>(
    callback: (
      config: z.infer<typeof VTStateSchema>,
    ) => T | Promise<T>,
  ): Promise<T> {
    const vtState = await this.loadVtState();
    const result = await Promise.resolve(callback(vtState));
    await this.saveVtState(vtState);
    return result;
  }

  /**
   * Get ignore list of globs from ignore files.
   *
   * @returns Promise that resolves with a list of glob strings.
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
