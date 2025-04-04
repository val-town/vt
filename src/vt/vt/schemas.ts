import { z } from "zod";

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
/**
 * JSON schema for the config.yaml file for configuration storage.
 */
export const VTConfigSchema = z.object({
  apiKey: z.string()
    .refine((val) => val === null || val.length === 33, {
      message: "API key must be exactly 33 characters long when provided",
    })
    .nullable()
    .default(null),
  dangerousOperations: z.object({
    confirmation: z.union([
      z.boolean(),
      z.enum(["true", "false", "0", "1"]).transform((val) =>
        val === "true" || val === "1" ? true : false
      ),
    ]).default(true),
  }).optional(),
});
