import { z } from "zod";

export const VTMetaConfigJsonSchema = z.object({
  projectId: z.string().uuid(),
  currentBranch: z.string().uuid(),
  version: z.number().gte(0),
});
