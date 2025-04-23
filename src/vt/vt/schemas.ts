import { join } from "@std/path";
import { z } from "zod";
import xdg from "xdg-portable";
import { META_IGNORE_FILE_NAME } from "~/consts.ts";

/**
 * JSON schema for the state.json file for the .vt folder.
 *
 * Contains required metadata for operations that require context about the val
 * town directory you are in, like the project that it represents.
 */
export const VTStateSchema = z.object({
  project: z.object({
    id: z.string().uuid(),
  }),
  branch: z.object({
    id: z.string().uuid(),
    version: z.number().gte(0),
  }),
  lastRun: z.object({
    pid: z.number().gte(0),
    time: z.string().refine((val) => !isNaN(Date.parse(val)), {}),
  }),
});

/**
 * JSON schema for the config.yaml file for configuration storage.
 */
export const VTConfigSchema = z.object({
  apiKey: z.string()
    .refine((val) => val === null || val.length === 33, {
      message: "API key must be exactly 33 characters long when provided",
    })
    .nullable(),
  globalIgnoreFiles: z.preprocess(
    (input) => {
      if (typeof input === "string") {
        return input.split(",").map((s) => s.trim()).filter(Boolean);
      }
      return input;
    },
    z.array(z.string()),
  ).optional(),
  dangerousOperations: z.object({
    confirmation: z.union([
      z.boolean(),
      z.enum(["true", "false"]).transform((val) => val === "true"),
    ]),
  }).optional(),
});

export const DefaultVTConfig: z.infer<typeof VTConfigSchema> = {
  apiKey: null,
  globalIgnoreFiles: [join(xdg.config(), META_IGNORE_FILE_NAME)],
  dangerousOperations: {
    confirmation: true,
  },
};
