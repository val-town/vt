import type z from "zod";
import {
  AUTH_CACHE_LOCALSTORE_ENTRY,
  GLOBAL_VT_META_FILE_PATH,
  SAW_AS_LATEST_VERSION,
} from "../consts.ts";
import { VTCheckCacheFile } from "~/vt/vt/schemas.ts";

/**
 * Cheap singleton that takes the place of localStorage but writes to a
 * file within the global configuration directory.
 *
 * Used for caching the results of authentication and upgrade checks.
 */
class VTCheckCache {
  async #read() {
    try {
      const text = await Deno.readTextFile(GLOBAL_VT_META_FILE_PATH);
      const json = JSON.parse(text);
      return VTCheckCacheFile.parse(json);
    } catch {
      return {};
    }
  }
  async getAuthChecked() {
    return (await this.#read())[AUTH_CACHE_LOCALSTORE_ENTRY];
  }
  async getLastSawAsLatestVersion() {
    return (await this.#read())[SAW_AS_LATEST_VERSION];
  }
  async setAuthCheckedToNow() {
    return await this.setItem(
      AUTH_CACHE_LOCALSTORE_ENTRY,
      new Date().toISOString(),
    );
  }
  async setLastSawAsLatestVersion(version: string) {
    return await this.setItem(SAW_AS_LATEST_VERSION, version);
  }
  async setItem(key: keyof z.infer<typeof VTCheckCacheFile>, value: string) {
    const before = await this.#read();
    await Deno.writeTextFile(
      GLOBAL_VT_META_FILE_PATH,
      JSON.stringify({
        ...before,
        [key]: value,
      }),
    );
  }
}

export const vtCheckCache = new VTCheckCache();
