import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { approvedExamples, repoRoot } from "./lib/corpus.mjs";

const skillsRoot = join(repoRoot, "claude-setup/skills");

const expectedSkills = [
  "zama-sdk-errors-and-debugging",
  "zama-sdk-local-development",
  "zama-sdk-node-backend",
  "zama-sdk-react-ethers",
  "zama-sdk-react-viem",
  "zama-sdk-react-wagmi",
];

const requiredSections = [
  "## When to Use",
  "## Source Priority",
  "## Reference Files",
  "## Golden Path",
  "## Implementation Rules",
  "## Common Pitfalls",
  "## Done When",
];

const issues = [];

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return null;
  }

  const meta = {};
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    meta[key] = value;
  }

  return meta;
}

function collectReferenceFiles(content) {
  const lines = content.split("\n");
  const sectionStart = lines.findIndex((line) => line.trim() === "## Reference Files");
  if (sectionStart === -1) {
    return [];
  }

  const references = [];
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith("## ")) {
      break;
    }
    const match = line.match(/^- `([^`]+)`$/);
    if (match) {
      references.push(match[1]);
    }
  }

  return references;
}

for (const skillName of expectedSkills) {
  const skillPath = join(skillsRoot, skillName, "SKILL.md");
  if (!existsSync(skillPath)) {
    issues.push(`Missing expected skill: ${skillName}`);
    continue;
  }

  const content = readFileSync(skillPath, "utf8");
  const frontmatter = parseFrontmatter(content);

  if (!frontmatter) {
    issues.push(`${skillName}: missing YAML frontmatter`);
  } else {
    if (frontmatter.name !== skillName) {
      issues.push(`${skillName}: frontmatter name must equal directory name`);
    }
    if (!frontmatter.description) {
      issues.push(`${skillName}: missing frontmatter description`);
    }
  }

  for (const section of requiredSections) {
    if (!content.includes(section)) {
      issues.push(`${skillName}: missing required section "${section}"`);
    }
  }

  if (content.includes("examples/react-ledger")) {
    issues.push(`${skillName}: must not reference excluded example path examples/react-ledger`);
  }

  if (!content.includes("docs/gitbook/src")) {
    issues.push(`${skillName}: must reference official docs paths`);
  }

  const references = collectReferenceFiles(content);
  if (references.length === 0) {
    issues.push(`${skillName}: must list concrete Reference Files`);
  }

  for (const reference of references) {
    const absolutePath = join(repoRoot, reference);
    if (!existsSync(absolutePath)) {
      issues.push(`${skillName}: missing reference file ${reference}`);
    }
  }

  const approvedExampleMention = approvedExamples.some((exampleName) =>
    content.includes(`examples/${exampleName}`),
  );
  if (!approvedExampleMention) {
    issues.push(`${skillName}: must reference at least one approved example`);
  }
}

if (issues.length > 0) {
  console.error("Claude Code skill validation failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Claude Code skill validation passed for ${expectedSkills.length} skills.`);
