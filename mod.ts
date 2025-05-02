#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net --allow-sys --allow-run
import { launch } from "./vt.ts";

/**
 * # vtlib
 *
 * ### What is `vtlib`?
 * `vtlib` is the internal library used by `vt`, the Val Town CLI. `vtlib` lets
 * you do `push`ing, `pull`ing, `clone`ing, and more, from a Deno context, so
 * that you can reuse much of the internal syncing functionality of `vt`.
 *
 * Primary library functions include
 *
 * - {@link checkout} Check out a branch from a Val Town project
 * - {@link clone} Clone a Val Town project to a local directory
 * - {@link create} Create a new Val Town project from local files
 * - {@link pull} Pull changes from a Val Town project to a local directory
 * - {@link push} Push local changes to a Val Town project
 * - {@link remix} Create a new project based on an existing project
 * - {@link status} Check the status of local files compared to a Val Town project
 *
 * @example Clone a project to a directory
 * ```typescript
 * import { clone } from "@valtown/vt";
 *
 * const result = await clone({
 *   projectId: "d23e2d8d-9cc8-40e3-bbf4-107c42efe6c1",
 *   branchId: "0e73994d-f9bd-4e59-a255-7f4593127623",
 *   targetDir: "./my-project"
 * });
 * ```
 *
 * @example Push changes to a project
 * ```typescript
 * import { push } from "@valtown/vt";
 *
 * const result = await push({
 *   projectId: "c085baed-ec07-4a2e-811a-216f567b5ef1",
 *   targetDir: "."
 * });
 * ```
 *
 * @example Create a new project from local files
 * ```typescript
 * import { create } from "@valtown/vt";
 *
 * const result = await create({
 *   projectId: "01b34cb3-f581-47c9-8024-ae126c0f0b1e",
 *   sourceDir: "./my-code"
 * });
 * ```
 *
 * @example Check status of local files compared to remote
 * ```typescript
 * import { status } from "@valtown/vt";
 *
 * const result = await status({
 *   projectId: "79af7bd7-3e5b-4492-8b14-dac502cdbce6",
 *   targetDir: "."
 * });
 * ```
 *
 * @example Remix an existing project
 * ```typescript
 * import { remix } from "@valtown/vt";
 *
 * const result = await remix({
 *   srcProjectId: "a35e5f60-5a47-4201-9d82-b6a60bd57d4d",
 *   projectName: "My Remix",
 *   targetDir: "./remixed-project"
 * });
 * ```
 *
 * @module
 */

if (import.meta.main) {
  await launch();
}

export * from "~/vt/lib/mod.ts";
