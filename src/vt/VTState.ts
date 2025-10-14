import { GLOBAL_VT_META_FILE_PATH } from "../consts.ts";

/**
 * Cheap single that takes the place of localStorage but writes to a
 * file within the global configuration directory.
 */
class VTState {
  async #read() {
    let before = await Deno.readTextFile(GLOBAL_VT_META_FILE_PATH)
      .then((text) => JSON.parse(text))
      .catch(() => {
        return {};
      });
    if (
      !(typeof before === "object" && before !== null && !Array.isArray(before))
    ) {
      before = {};
    }
    return before;
  }
  async getItem(key: string) {
    const before = await this.#read();
    return before[key];
  }
  async setItem(key: string, value: unknown) {
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

export const vtState = new VTState();
