// Deterministic, no-LLM collection of the A->B "what changed" signal (SDK-208).
//
// Produces the frozen input bundle for the generate-migration-guide skill: a
// unified diff of llms-full.txt, per-package API report diffs, and the root
// changelog slice. Versioned artifacts are committed per tag, so each side is
// `git show <ref>:<path>` with no rebuild. See docs/agents/example-upgrade-pipeline-plan.md.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export const API_REPORTS = [
  "packages/sdk/etc/sdk.api.md",
  "packages/sdk/etc/sdk-ethers.api.md",
  "packages/sdk/etc/sdk-node.api.md",
  "packages/sdk/etc/sdk-query.api.md",
  "packages/sdk/etc/sdk-viem.api.md",
  "packages/react-sdk/etc/react-sdk.api.md",
  "packages/react-sdk/etc/react-sdk-wagmi.api.md",
];
export const LLMS_FULL = "llms-full.txt";
export const CHANGELOG = "CHANGELOG.md";

// `git show <ref>:<path>` -> string, or null when the path is absent at that ref.
export function showAtRef(ref, path) {
  const result = spawnSync("git", ["show", `${ref}:${path}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : null;
}

// True when `<ref>` resolves to a commit locally. Distinguishes "ref missing"
// from "path absent at ref" — `showAtRef` returns null for both, which would
// otherwise classify every input as added/absent and yield a silent garbage bundle.
export function refExists(ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
    encoding: "utf8",
  });
  return result.status === 0;
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
  const result = spawnSync("diff", ["-u", "--label", `a/${label}`, "--label", `b/${label}`, a, b], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status === 0) {
    return "";
  }
  if (result.status !== 1) {
    throw new Error(`diff failed for ${label}: ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * Collect the A->B diff bundle into `outDir`. Returns the bundle summary.
 * `read` is the ref->content accessor (defaults to `showAtRef`), injectable for tests.
 */
export function collectDiff({
  fromRef,
  toRef,
  fromVersion,
  toVersion,
  outDir,
  read = showAtRef,
  refExists: refExistsFn = refExists,
}) {
  for (const ref of [fromRef, toRef]) {
    if (!refExistsFn(ref)) {
      throw new Error(
        `git ref "${ref}" not found locally — the tag may be missing or unfetched. ` +
          "Run `git fetch --tags` and retry.",
      );
    }
  }
  const tmpDir = join(outDir, ".diff-tmp");
  mkdirSync(join(outDir, "api"), { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  const summary = {
    fromVersion: fromVersion ?? fromRef,
    toVersion: toVersion ?? toRef,
    fromRef,
    toRef,
    generatedAt: new Date().toISOString(),
    files: [],
  };

  const record = (kind, path, outName) => {
    const before = read(fromRef, path);
    const after = read(toRef, path);
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
  };

  record("llms-full", LLMS_FULL, "llms-full.diff");
  for (const path of API_REPORTS) {
    const base = path
      .split("/")
      .pop()
      .replace(/\.api\.md$/, "");
    record("api-report", path, `api/${base}.diff`);
  }
  record("changelog", CHANGELOG, "changelog.diff");

  rmSync(tmpDir, { recursive: true, force: true });
  writeFileSync(join(outDir, "bundle.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}
