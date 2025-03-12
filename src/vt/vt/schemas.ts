import { z } from "zod";

/**
 * JSON schema for the vt.json file in .vt.
 *
 * Contains required metadata for operations that require context about the val
 * town directory you are in, like the project that it represents.
 */
export const VTSchema = z.object({
  projectId: z.string().uuid(),
  currentBranch: z.string().uuid(),
  version: z.number().gte(0),
});
