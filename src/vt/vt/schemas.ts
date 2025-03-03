import { z } from "zod";

/**
 * JSON schema for the VTMetaConfig JSON file.
 *
 * Contains required metadata for operations that require context about the val
 * town directory you are in, like the project that it represents.
 */
export const VTMetaConfigJsonSchema = z.object({
  projectId: z.string().uuid(),
  currentBranch: z.string().uuid(),
  version: z.number().gte(0),
});
