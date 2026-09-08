import type { Skill } from "@valtown/skills";

const AGENTS_MD_INTRO = `# Val Town Agent Instructions

Val Town is a platform for running serverless TypeScript projects called "vals". Keep these conventions in mind when working on a val. For detailed topic guidance, load the relevant Val Town plugin skill.
`;

function getLines(body: string): string[] {
  return body.split(/\r?\n/);
}

/** Extract the first \`## Rules\` section from a skill body, if present. */
function extractRulesSection(body: string): string | null {
  const lines = getLines(body);
  const start = lines.findIndex((line) => line.trim() === "## Rules");
  if (start === -1) return null;

  const collected: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) break;
    collected.push(line);
  }
  const text = collected.join("\n").trim();
  return text.length > 0 ? text : null;
}

/** Extract the first paragraph after the title heading, or from the body start if there is no title. */
function extractIntro(body: string): string {
  const lines = getLines(body);
  let collecting = false;
  let titleFound = false;
  const collected: string[] = [];
  for (const line of lines) {
    if (!collecting) {
      if (/^#\s+/.test(line)) {
        collecting = true;
        titleFound = true;
        continue;
      }
      if (line.trim() !== "" && !/^##\s+/.test(line)) {
        collecting = true;
      }
      continue;
    }
    if (/^##\s+/.test(line) || (titleFound && /^#\s+/.test(line))) break;
    if (line.trim() === "" && collected.length > 0) break;
    collected.push(line);
  }
  const text = collected.join(" ").replace(/\s+/g, " ").trim();
  return text.length > 350 ? `${text.slice(0, 350).trim()}...` : text;
}

function toBullets(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) =>
    l.length > 0
  );
  if (lines.length === 0) return "";
  if (lines.every((l) => l.startsWith("- ") || l.startsWith("* "))) {
    return lines.join("\n");
  }
  // Non-bullet section: wrap in a single bullet.
  return `- ${lines.join(" ").replace(/\s+/g, " ")}`;
}

/** Build a short, always-in-context AGENTS.md from plugin skills. */
export function generateAgentsMd(skills: Skill[]): string {
  const conventionSections: string[] = [];

  for (const skill of skills) {
    const rules = extractRulesSection(skill.body);
    if (rules) {
      conventionSections.push(`### ${skill.name}\n\n${toBullets(rules)}`);
    } else {
      const intro = extractIntro(skill.body);
      if (intro.length > 0) {
        conventionSections.push(`### ${skill.name}\n\n- ${intro}`);
      }
    }
  }

  const skillReferences = skills
    .map((s) => `- **${s.name}** — ${s.description}`)
    .join("\n");

  return `${AGENTS_MD_INTRO}\n## Core conventions\n\n${
    conventionSections.join("\n\n")
  }\n\n## Skill reference\n\n${skillReferences}\n`;
}
