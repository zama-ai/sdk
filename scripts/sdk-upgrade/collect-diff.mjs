// Phase 0 of the SDK-aware app upgrade pipeline (SDK-208).
//
// Deterministic, no-LLM collection of the A->B "what changed" signal: a unified
// diff of llms-full.txt, per-package API report diffs, and the root changelog
// slice. The output bundle is the frozen input to the generate-migration-guide
// skill (Half 1 of the pipeline). See docs/agents/example-upgrade-pipeline-plan.md.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const API_REPORTS = [
  "packages/sdk/etc/sdk.api.md",
  "packages/sdk/etc/sdk-ethers.api.md",
  "packages/sdk/etc/sdk-node.api.md",
  "packages/sdk/etc/sdk-query.api.md",
  "packages/sdk/etc/sdk-viem.api.md",
  "packages/react-sdk/etc/react-sdk.api.md",
  "packages/react-sdk/etc/react-sdk-wagmi.api.md",
];
const LLMS_FULL = "llms-full.txt";
const CHANGELOG = "CHANGELOG.md";

const { values } = parseArgs({
  options: {
    "from-ref": { type: "string" },
    "to-ref": { type: "string" },
    "from-version": { type: "string" },
    "to-version": { type: "string" },
    out: { type: "string" },
  },
});

const fromRef = values["from-ref"];
const toRef = values["to-ref"];
const fromVersion = values["from-version"] ?? fromRef;
const toVersion = values["to-version"] ?? toRef;
const outDir = values.out;

if (!fromRef || !toRef || !outDir) {
  console.error(
    "Usage: collect-diff.mjs --from-ref <git-ref> --to-ref <git-ref> --out <dir> [--from-version v] [--to-version v]",
  );
  process.exit(2);
}

// `git show <ref>:<path>` -> string, or null when the path is absent at that ref.
function showAtRef(ref, path) {
  const result = spawnSync("git", ["show", `${ref}:${path}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : null;
}

// Unified diff of two strings via temp files; "" when identical, null when both absent.
function unifiedDiff(label, before, after, tmpDir) {
  if (before === null && after === null) {
    return null;
  }
  const a = join(tmpDir, "a");
  const b = join(tmpDir, "b");
  writeFileSync(a, before ?? "");
  writeFileSync(b, after ?? "");
  const result = spawnSync(
    "diff",
    ["-u", "--label", `a/${label}`, "--label", `b/${label}`, a, b],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status === 0) {
    return "";
  }
  if (result.status !== 1) {
    throw new Error(`diff failed for ${label}: ${result.stderr}`);
  }
  return result.stdout;
}

const tmpDir = join(outDir, ".diff-tmp");
mkdirSync(join(outDir, "api"), { recursive: true });
mkdirSync(tmpDir, { recursive: true });

const summary = {
  fromVersion,
  toVersion,
  fromRef,
  toRef,
  generatedAt: new Date().toISOString(),
  files: [],
};

function record(kind, path, outName, before, after) {
  const diff = unifiedDiff(path, before, after, tmpDir);
  const status =
    diff === null
      ? "absent"
      : diff === ""
        ? "unchanged"
        : before === null
          ? "added"
          : after === null
            ? "removed"
            : "changed";
  if (diff) {
    writeFileSync(join(outDir, outName), diff);
  }
  summary.files.push({
    kind,
    path,
    status,
    diffFile: diff ? outName : null,
    diffBytes: diff ? Buffer.byteLength(diff) : 0,
  });
}

// llms-full corpus (docs + approved examples + READMEs)
record("llms-full", LLMS_FULL, "llms-full.diff", showAtRef(fromRef, LLMS_FULL), showAtRef(toRef, LLMS_FULL));

// per-package API reports (the signature-level semantic signal)
for (const path of API_REPORTS) {
  const base = path.split("/").pop().replace(/\.api\.md$/, "");
  record("api-report", path, `api/${base}.diff`, showAtRef(fromRef, path), showAtRef(toRef, path));
}

// root changelog slice
record("changelog", CHANGELOG, "changelog.diff", showAtRef(fromRef, CHANGELOG), showAtRef(toRef, CHANGELOG));

rmSync(tmpDir, { recursive: true, force: true });
writeFileSync(join(outDir, "bundle.json"), `${JSON.stringify(summary, null, 2)}\n`);

const changed = summary.files.filter((f) => f.status === "changed" || f.status === "added" || f.status === "removed");
console.log(`Collected ${fromVersion} -> ${toVersion} into ${outDir}`);
for (const f of summary.files) {
  console.log(`  ${f.status.padEnd(9)} ${f.kind.padEnd(11)} ${f.path}${f.diffBytes ? `  (${f.diffBytes} B)` : ""}`);
}
console.log(`bundle.json written; ${changed.length}/${summary.files.length} inputs changed.`);
