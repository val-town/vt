import { skillList } from "@valtown/skills";
import { generateAgentsMd } from "../src/vt/lib/agentsMd.ts";

await Deno.writeTextFile("AGENTS.md", generateAgentsMd(skillList));
