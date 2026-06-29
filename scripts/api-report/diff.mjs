import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "base-dir": { type: "string" },
    "pr-dir": { type: "string" },
    out: { type: "string" },
    "max-bytes": { type: "string", default: "60000" },
    summary: { type: "string" },
  },
});

const baseDir = values["base-dir"];
const prDir = values["pr-dir"];
const outPath = values.out;
const maxBytes = Number.parseInt(values["max-bytes"], 10);
const summaryPath = values.summary;

if (!baseDir || !prDir || !outPath) {
  console.error(
    "Usage: api-report:diff --base-dir <dir> --pr-dir <dir> --out <file> [--max-bytes N] [--summary <file>]",
  );
  process.exit(2);
}

const listFiles = (dir) => (existsSync(dir) ? readdirSync(dir) : []);
const names = [...new Set([...listFiles(baseDir), ...listFiles(prDir)])].toSorted((a, b) =>
  a.localeCompare(b),
);

const marker = "<!-- api-report-diff -->";
const perFileDiffs = [];

for (const name of names) {
  const basePath = join(baseDir, name);
  const prPath = join(prDir, name);
  const baseFile = existsSync(basePath) ? basePath : "/dev/null";
  const prFile = existsSync(prPath) ? prPath : "/dev/null";

  const result = spawnSync(
    "diff",
    ["-u", "--label", `a/${name}`, "--label", `b/${name}`, baseFile, prFile],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );

  // diff exits 0 when identical, 1 when different, >=2 on error.
  if (result.status === 0) {
    continue;
  }
  if (result.status !== 1) {
    console.error(`diff failed for ${name}: ${result.stderr}`);
    process.exit(result.status ?? 1);
  }
  perFileDiffs.push({ name, diff: result.stdout });
}

const hasChanges = perFileDiffs.length > 0;

const summarySection = ["## Public API Changes", ""];
for (const { name, diff } of perFileDiffs) {
  summarySection.push(`### ${name}`, "````diff", diff.trimEnd(), "````", "");
}

if (summaryPath) {
  const summaryBody = hasChanges ? summarySection.join("\n") : "No public API changes detected.\n";
  appendFileSync(summaryPath, `${summaryBody}\n`);
}

let body;
if (hasChanges) {
  const sections = [];
  let totalLen = 0;
  let truncated = false;

  for (const { name, diff } of perFileDiffs) {
    const section = [
      "<details>",
      `<summary><code>${name}</code></summary>`,
      "",
      "````diff",
      diff.trimEnd(),
      "````",
      "",
      "</details>",
      "",
    ].join("\n");

    if (totalLen + section.length > maxBytes) {
      truncated = true;
      break;
    }
    totalLen += section.length;
    sections.push(section);
  }

  const parts = [marker, "## Public API Changes", "", ...sections];
  if (truncated) {
    parts.push("... (truncated, see Actions run summary for full diff)");
  }
  body = parts.join("\n");
} else {
  body = [
    marker,
    "## Public API Changes",
    "",
    ":white_check_mark: No public API changes detected.",
  ].join("\n");
}

writeFileSync(outPath, body);
process.stdout.write(`has_changes=${hasChanges}\n`);
