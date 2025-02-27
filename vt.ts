#!/usr/bin/env -S deno run -A
import { cmd as vt } from "./root.ts";
import "jsr:@std/dotenv/load";

export { vt };
export default vt;

if (import.meta.main) {
  await vt.parse(Deno.args);
}
