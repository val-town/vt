import { z } from "zod";
import { DEFAULT_EDITOR_TEMPLATE } from "~/consts.ts";

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
    .refine((val) => val === null || val.length === 32 || val.length === 33, {
      message: "API key must be 32-33 characters long when provided",
    })
    .nullable(),
  dangerousOperations: z.object({
    confirmation: z.union([
      z.boolean(),
      z.enum(["true", "false"]).transform((val) => val === "true"),
    ]),
  }).optional(),
  editorTemplate: z.string().optional(), // a project URI
});

export const DefaultVTConfig: z.infer<typeof VTConfigSchema> = {
  apiKey: null,
  dangerousOperations: {
    confirmation: true,
  },
  editorTemplate: DEFAULT_EDITOR_TEMPLATE,
};
