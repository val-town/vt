#!/usr/bin/env -S deno run -A
import { cmd as vt } from "~/cmd/root/root.ts";

export default vt;

if (import.meta.main) {
  await vt.parse(Deno.args);
}
