import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { findUrlProblems } from "../check-target.mjs";
import {
  alphaHasSubstance,
  emptyAlphaTemplate,
  RAW_END,
  RAW_START,
  TODO_MARKER,
} from "../changelog.mjs";
import { retargetUrls } from "../retarget.mjs";

// ─────────────────────────────────────────────── function-level regressions ──

describe("retargetUrls — raw.githubusercontent branch segment", () => {
  test("main → prerelease flips the branch", () => {
    expect(retargetUrls("raw.githubusercontent.com/zama-ai/sdk/main/llms.txt", "prerelease")).toBe(
      "raw.githubusercontent.com/zama-ai/sdk/prerelease/llms.txt",
    );
  });

  test("prerelease → main flips back", () => {
    expect(
      retargetUrls("raw.githubusercontent.com/zama-ai/sdk/prerelease/llms-full.txt", "main"),
    ).toBe("raw.githubusercontent.com/zama-ai/sdk/main/llms-full.txt");
  });
});

describe("retargetUrls — docs.zama.org space segment (stable is implicit)", () => {
  const stableUrl = "docs.zama.org/protocol/sdk/guides/handle-errors.md";
  const alphaUrl = "docs.zama.org/protocol/sdk/alpha/guides/handle-errors.md";

  test("main → prerelease INSERTS the alpha segment", () => {
    expect(retargetUrls(stableUrl, "prerelease")).toBe(alphaUrl);
  });

  test("prerelease → main REMOVES the alpha segment", () => {
    expect(retargetUrls(alphaUrl, "main")).toBe(stableUrl);
  });

  test("retargeting to the current branch is a no-op (idempotent)", () => {
    expect(retargetUrls(alphaUrl, "prerelease")).toBe(alphaUrl);
    expect(retargetUrls(stableUrl, "main")).toBe(stableUrl);
  });

  test("rewrites every occurrence on a line", () => {
    const both = `see ${stableUrl} and ${stableUrl}`;
    expect(retargetUrls(both, "prerelease")).toBe(`see ${alphaUrl} and ${alphaUrl}`);
  });

  test("does not treat a real path segment as a space segment", () => {
    // `overview` is a page, not a space — alpha must be inserted before it.
    expect(retargetUrls("docs.zama.org/protocol/sdk/overview.md", "prerelease")).toBe(
      "docs.zama.org/protocol/sdk/alpha/overview.md",
    );
  });
});

describe("retargetUrls — round-trip byte-identity", () => {
  // A promotion (main→prerelease) followed by its inverse (prerelease→main) must
  // return the exact original bytes, and vice-versa. Any asymmetry in the
  // insert/remove-`alpha/` logic would surface as a mismatch here.
  test("main → prerelease → main is byte-identical", () => {
    const stable = [
      "raw.githubusercontent.com/zama-ai/sdk/main/llms.txt",
      "docs.zama.org/protocol/sdk/guides/x.md",
      "docs.zama.org/protocol/sdk/reference/sdk/Token.md",
      "github.com/zama-ai/sdk/blob/main/CHANGELOG.md",
    ].join("\n");
    expect(retargetUrls(retargetUrls(stable, "prerelease"), "main")).toBe(stable);
  });

  test("prerelease → main → prerelease is byte-identical", () => {
    const alpha = [
      "raw.githubusercontent.com/zama-ai/sdk/prerelease/llms-full.txt",
      "docs.zama.org/protocol/sdk/alpha/guides/x.md",
      "docs.zama.org/protocol/sdk/alpha/overview.md",
    ].join("\n");
    expect(retargetUrls(retargetUrls(alpha, "main"), "prerelease")).toBe(alpha);
  });
});

describe("retargetUrls — mixed content", () => {
  test("only the wrong URL flips; correct and unrelated URLs stay put", () => {
    const content = [
      "docs.zama.org/protocol/sdk/alpha/wrong.md", // wrong for main → flips to stable
      "docs.zama.org/protocol/sdk/right.md", // already stable → unchanged
      "raw.githubusercontent.com/zama-ai/sdk/main/ok.txt", // already main → unchanged
      "docs.zama.org/other/path.md", // not the /protocol/sdk/ space → unchanged
    ].join("\n");
    expect(retargetUrls(content, "main")).toBe(
      [
        "docs.zama.org/protocol/sdk/wrong.md",
        "docs.zama.org/protocol/sdk/right.md",
        "raw.githubusercontent.com/zama-ai/sdk/main/ok.txt",
        "docs.zama.org/other/path.md",
      ].join("\n"),
    );
  });
});

describe("retargetUrls — malformed / out-of-scope links are left alone", () => {
  test("a bare `.../sdk/main` with no trailing slash is not rewritten", () => {
    // The raw.github rewrite only targets the `<branch>/<path>` form. A dangling
    // `.../sdk/main` (end of string, no following `/path`) has no trailing slash and
    // must be left untouched — flipping it would corrupt a non-file reference.
    const bare = "see raw.githubusercontent.com/zama-ai/sdk/main";
    expect(retargetUrls(bare, "prerelease")).toBe(bare);
  });

  test("a github `blob/<branch>` link is never retargeted", () => {
    // The canonical CHANGELOG link lives at github.com/.../blob/main and must always
    // point at main regardless of target — it is neither a raw.github corpus link nor
    // a docs.zama.org space link, so retargetUrls must not touch it.
    const blob = "github.com/zama-ai/sdk/blob/main/CHANGELOG.md";
    expect(retargetUrls(blob, "prerelease")).toBe(blob);
    expect(retargetUrls(blob, "main")).toBe(blob);
  });
});

describe("findUrlProblems — catches the implicit-stable blind spot", () => {
  test("space-less (stable) URL on prerelease is flagged", () => {
    const problems = findUrlProblems("docs.zama.org/protocol/sdk/guides/x.md", "prerelease");
    expect(problems).toEqual([`links to the "stable" GitBook space (expected "alpha")`]);
  });

  test("alpha URL on main is flagged", () => {
    const problems = findUrlProblems("docs.zama.org/protocol/sdk/alpha/guides/x.md", "main");
    expect(problems).toEqual([`links to the "alpha" GitBook space (expected "stable")`]);
  });

  test("correctly-targeted URLs are clean in both directions", () => {
    expect(findUrlProblems("docs.zama.org/protocol/sdk/alpha/x.md", "prerelease")).toEqual([]);
    expect(findUrlProblems("docs.zama.org/protocol/sdk/x.md", "main")).toEqual([]);
  });

  test("wrong raw.githubusercontent branch is flagged", () => {
    const problems = findUrlProblems(
      "raw.githubusercontent.com/zama-ai/sdk/main/llms.txt",
      "prerelease",
    );
    expect(problems).toEqual([`links to the "main" branch (expected "prerelease")`]);
  });
});

// ───────────────────────────────── promotion-through-retarget integration ──
//
// These drive the REAL retarget.mjs as a subprocess over a throwaway tmp fixture
// tree (scripts resolve their root from process.cwd(), so cwd = the fixture). They
// exercise the full ordering — promote → URL-rewrite → oxfmt → llm:build — and its
// coupling with promoteChangelog. Never touch the live worktree docs/corpus.

const testDir = dirname(fileURLToPath(import.meta.url));
const scriptsDocsDir = join(testDir, ".."); // scripts/docs
const repoRoot = join(scriptsDocsDir, "..", ".."); // repo root
const repoBinDir = join(repoRoot, "node_modules/.bin"); // oxfmt lives here
const RETARGET = join(scriptsDocsDir, "retarget.mjs");
const CHECK_TARGET = join(scriptsDocsDir, "check-target.mjs");
const BUILD_LLMS = join(scriptsDocsDir, "..", "llm", "build-llms.mjs");

// The fixture has no node_modules; retarget falls back to a bare `oxfmt` and
// build-llms shells a bare `oxfmt` too, so the real repo's .bin must be on PATH.
const childEnv = { ...process.env, PATH: `${repoBinDir}:${process.env.PATH ?? ""}` };

function runNode(script, args, cwd) {
  return spawnSync("node", [script, ...args], { cwd, encoding: "utf8", env: childEnv });
}

function expectOk(res) {
  if (res.status !== 0) {
    throw new Error(
      `expected exit 0 but got ${res.status}\n── stdout ──\n${res.stdout}\n── stderr ──\n${res.stderr}`,
    );
  }
}

const CHANGELOG = `# Changelog

## [3.4.0](https://github.com/zama-ai/sdk/compare/v3.3.0...v3.4.0) (2026-07-17)

### Features

- **sdk:** ship the FHE runtime tuning knobs ([#600](https://github.com/zama-ai/sdk/issues/600))

## [3.3.0](https://github.com/zama-ai/sdk/compare/v3.2.0...v3.3.0) (2026-07-08)

### Features

- **sdk:** confidentialTransferAndCall ([#500](https://github.com/zama-ai/sdk/issues/500))
`;

const README = `# Zama SDK

### What is Zama SDK?

The Zama SDK lets developers build privacy-preserving dApps with FHE behind a clear-text-in, clear-text-out API.
`;

const SUMMARY = `# Table of contents

## Changelog

- [Alpha](changelog/alpha.md)
- [3.x](changelog/v3.md)
  - [3.1.x](changelog/v3-1.md)
  - [3.0.x](changelog/v3-0.md)

## Docs

- [Overview](overview.md)
`;

const OVERVIEW = `---
title: Overview
description: Overview of the Zama SDK.
---

# Overview

Welcome to the SDK docs.
`;

const V3_INDEX = `---
title: 3.x
description: Release notes for the 3.x line.
---

# 3.x

Plain-language release notes for the \`3.x\` line.

## Versions

- [**3.1.x**](v3-1.md) — Release notes for the 3.1.x line.
- [**3.0.x**](v3-0.md) — Release notes for the 3.0.x line.
`;

const V3_0 = `---
title: 3.0.x
description: Release notes for the 3.0.x line.
---

# 3.0.x

This page covers the \`3.0.x\` line.

## 3.0.0

_Released 2026-01-01._

The first stable v3 line.
`;

// Carries an inbound anchor into the Alpha page's "FHE runtime" heading — promotion
// must repoint it to the new version page (else it dangles). Exercises A1's
// anchor-repoint folded into retarget's changed[].
const V3_1 = `---
title: 3.1.x
description: Release notes for the 3.1.x line.
---

# 3.1.x

This page covers the \`3.1.x\` line.

## 3.1.0

_Released 2026-02-01._

Per-chain tuning is documented under [FHE runtime](alpha.md#fhe-runtime).
`;

// A staged Alpha page: editorial prose (with a flippable alpha-space URL and a
// prerelease raw.github URL, so promotion carries them into the version page and
// retarget's URL-rewrite must flip them), plus the machine-owned raw-material block.
const STAGED_ALPHA = [
  "---",
  "title: Alpha",
  "description: Unreleased changes on the prerelease (alpha) line.",
  "---",
  "",
  "# Alpha",
  "",
  '{% hint style="warning" %}',
  "**Unreleased.** These changes are on the prerelease (`alpha`) line and are not yet in a stable release.",
  "{% endhint %}",
  "",
  "The internal FHE backend moved to `@fhevm/sdk`. See the [alpha runtime reference](https://docs.zama.org/protocol/sdk/alpha/guides/runtime.md) and the [raw corpus](https://raw.githubusercontent.com/zama-ai/sdk/prerelease/llms.txt).",
  "",
  "## FHE runtime",
  "",
  "`createConfig` accepts a process-wide `runtime` object that configures the FHE engine.",
  "",
  // A table whose column width is driven by an alpha-space URL: flipping it to
  // stable (dropping the `alpha/` segment, 6 chars) forces oxfmt to reflow the
  // table. This is the #538 shape — if llm:build ran BEFORE oxfmt, the corpus would
  // capture the pre-reflow widths and a fresh build would diverge.
  "| Setting | Reference |",
  "| --- | --- |",
  "| runtime | https://docs.zama.org/protocol/sdk/alpha/guides/runtime.md |",
  "",
  "## Bug fixes",
  "",
  "- **sdk:** correct the Hoodi KMSVerifier preset address.",
  "",
  RAW_START,
  "",
  "## Release notes (raw material)",
  "",
  TODO_MARKER,
  "",
  "### 3.4.0-alpha.1 — 2026-07-15",
  "",
  "#### Features",
  "",
  "- **sdk:** ship the FHE runtime tuning knobs ([#600](https://github.com/zama-ai/sdk/issues/600))",
  "",
  RAW_END,
  "",
].join("\n");

const createdDirs = [];

function freshDir() {
  const dir = mkdtempSync(join(tmpdir(), "retarget-it-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function write(root, rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function corpusConfig(branch) {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      rawGithubBaseUrl: `https://raw.githubusercontent.com/zama-ai/sdk/${branch}`,
      docs: { root: "docs/gitbook/src", summary: "docs/gitbook/src/SUMMARY.md" },
      examples: { approved: ["no-example"], excluded: ["no-excluded"], docFiles: ["README.md"] },
      readmes: [
        { path: "README.md", title: "Repository README", description: "Monorepo overview." },
      ],
      apiReports: ["etc/none.api.md"],
      forbiddenPaths: ["node_modules"],
    },
    null,
    2,
  )}\n`;
}

/** Build a corpus-buildable fixture tree. `branch` sets corpus.config's rawGithubBaseUrl;
 *  `alpha` is a staged tip ("staged") or the empty reset template ("empty"). */
function makeFixture(root, { branch = "prerelease", alpha = "staged" } = {}) {
  write(root, "CHANGELOG.md", CHANGELOG);
  write(root, "README.md", README);
  write(root, "docs/llm/corpus.config.json", corpusConfig(branch));
  write(root, "docs/gitbook/src/SUMMARY.md", SUMMARY);
  write(root, "docs/gitbook/src/overview.md", OVERVIEW);
  write(root, "docs/gitbook/src/changelog/v3.md", V3_INDEX);
  write(root, "docs/gitbook/src/changelog/v3-0.md", V3_0);
  write(root, "docs/gitbook/src/changelog/v3-1.md", V3_1);
  write(
    root,
    "docs/gitbook/src/changelog/alpha.md",
    alpha === "staged" ? STAGED_ALPHA : emptyAlphaTemplate(),
  );
}

/** relpath → bytes for every file under `root` (catches new files too). */
function snapshotTree(root) {
  const out = {};
  for (const name of readdirSync(root, { recursive: true })) {
    if (typeof name !== "string") {
      continue;
    }
    const abs = join(root, name);
    if (statSync(abs).isFile()) {
      out[name] = readFileSync(abs, "utf8");
    }
  }
  return out;
}

const VERSION_PAGE = "docs/gitbook/src/changelog/v3-4.md";
const ALPHA_PAGE = "docs/gitbook/src/changelog/alpha.md";
const read = (root, rel) => readFileSync(join(root, rel), "utf8");

describe("docs:retarget main — promotion integration", () => {
  test(
    "promote-once: version page created, alpha reset, SUMMARY + index wired, anchors repointed",
    { timeout: 60_000 },
    () => {
      const dir = freshDir();
      makeFixture(dir);

      expectOk(runNode(RETARGET, ["main"], dir));

      // A version page for 3.4.0 exists with the moved prose (headings demoted one
      // level so `## FHE runtime` nests as `### FHE runtime` under `## 3.4.0`).
      const versionPage = read(dir, VERSION_PAGE);
      expect(versionPage).toContain("## 3.4.0");
      expect(versionPage).toContain("_Released 2026-07-17._");
      expect(versionPage).toContain("### FHE runtime");
      expect(versionPage).toContain("object that configures the FHE engine");
      // Machine-owned scaffolding + the Alpha page's own H1 must NOT carry over.
      expect(versionPage).not.toContain(RAW_START);
      expect(versionPage).not.toContain(TODO_MARKER);
      expect(versionPage).not.toMatch(/^#\s+Alpha\s*$/m);

      // The moved URLs are flipped to the stable space (the #450 guard).
      expect(versionPage).toContain("docs.zama.org/protocol/sdk/guides/runtime.md");
      expect(versionPage).not.toContain("docs.zama.org/protocol/sdk/alpha/");
      expect(versionPage).toContain("raw.githubusercontent.com/zama-ai/sdk/main/llms.txt");
      expect(versionPage).not.toContain("/sdk/prerelease/");

      // Alpha page reset to the empty template.
      expect(alphaHasSubstance(read(dir, ALPHA_PAGE))).toBe(false);
      expect(read(dir, ALPHA_PAGE)).not.toContain("object that configures the FHE engine");

      // Nav wired: SUMMARY child + major-index bullet.
      expect(read(dir, "docs/gitbook/src/SUMMARY.md")).toContain("changelog/v3-4.md");
      expect(read(dir, "docs/gitbook/src/changelog/v3.md")).toMatch(/v3-4\.md/);

      // Inbound anchor repointed off the (now emptied) alpha page.
      const v31 = read(dir, "docs/gitbook/src/changelog/v3-1.md");
      expect(v31).toContain("v3-4.md#fhe-runtime");
      expect(v31).not.toContain("alpha.md#fhe-runtime");
    },
  );

  test(
    "run twice from an already-promoted state ⇒ zero diff (highest-value)",
    { timeout: 60_000 },
    () => {
      const dir = freshDir();
      makeFixture(dir);

      expectOk(runNode(RETARGET, ["main"], dir));
      const afterFirst = snapshotTree(dir);

      expectOk(runNode(RETARGET, ["main"], dir));
      const afterSecond = snapshotTree(dir);

      // No second version section, alpha/SUMMARY unchanged, corpus byte-identical.
      expect(afterSecond).toEqual(afterFirst);
      expect(afterSecond[VERSION_PAGE].match(/^## 3\.4\.0\s*$/gm)?.length).toBe(1);
    },
  );

  test(
    "formatting invariant: a fresh llm:build reproduces the corpus byte-for-byte",
    { timeout: 60_000 },
    () => {
      const dir = freshDir();
      makeFixture(dir);

      expectOk(runNode(RETARGET, ["main"], dir));

      const corpus = ["llms.txt", "llms-full.txt", "docs/llm/corpus-manifest.json"];
      const afterRetarget = Object.fromEntries(corpus.map((f) => [f, read(dir, f)]));

      // The `llm:check` verify-clean invariant: rebuilding from the (oxfmt'd) sources
      // must not change a byte (the #538 regression: build-before-oxfmt would diverge).
      expectOk(runNode(BUILD_LLMS, [], dir));
      for (const f of corpus) {
        expect(read(dir, f), `${f} not reproduced by a fresh build`).toBe(afterRetarget[f]);
      }

      // And retarget's written sources are oxfmt-stable (guards url-rewrite-after-oxfmt).
      const written = [
        VERSION_PAGE,
        "docs/gitbook/src/changelog/v3-1.md",
        "docs/gitbook/src/changelog/v3.md",
        ALPHA_PAGE,
        "docs/gitbook/src/SUMMARY.md",
        "docs/llm/corpus.config.json",
      ];
      const beforeFmt = Object.fromEntries(written.map((f) => [f, read(dir, f)]));
      const fmt = spawnSync(
        join(repoBinDir, "oxfmt"),
        written.map((f) => join(dir, f)),
        { cwd: dir, encoding: "utf8", env: childEnv },
      );
      expectOk(fmt);
      for (const f of written) {
        expect(read(dir, f), `${f} not oxfmt-stable after retarget`).toBe(beforeFmt[f]);
      }
    },
  );

  test(
    "check-target main passes on the promoted version page (no residual alpha/ URLs)",
    { timeout: 60_000 },
    () => {
      const dir = freshDir();
      makeFixture(dir);

      expectOk(runNode(RETARGET, ["main"], dir));
      // Meaningful only because the promoted page carried alpha URLs that retarget
      // flipped: had it not, check-target main would fail here.
      const check = runNode(CHECK_TARGET, ["main"], dir);
      expect(check.status, `check-target main failed:\n${check.stderr}`).toBe(0);
    },
  );

  test("promotion-failure isolation: a throw leaves URL/corpus outputs untouched", () => {
    const dir = freshDir();
    makeFixture(dir);
    // Force promoteChangelog to throw: a missing CHANGELOG.md makes parseChangelog(null)
    // blow up. Promotion runs FIRST and flushes only on success, so retarget must abort
    // before any URL/corpus write regardless of *why* promotion threw.
    unlinkSync(join(dir, "CHANGELOG.md"));
    const before = snapshotTree(dir);

    const res = runNode(RETARGET, ["main"], dir);

    expect(res.status).not.toBe(0);
    expect(snapshotTree(dir)).toEqual(before); // nothing half-written
    expect(read(dir, "docs/llm/corpus.config.json")).toContain("/sdk/prerelease");
    expect(existsSync(join(dir, "llms.txt"))).toBe(false); // build never ran
  });

  test("no-op-safe: nothing to promote and no URLs to flip ⇒ exit 0, zero writes", () => {
    const dir = freshDir();
    // Already on main + an empty Alpha page ⇒ promoteChangelog no-ops ("alpha page is
    // empty") and there are no URLs to flip.
    makeFixture(dir, { branch: "main", alpha: "empty" });
    const before = snapshotTree(dir);

    const res = runNode(RETARGET, ["main"], dir);

    expectOk(res);
    expect(snapshotTree(dir)).toEqual(before); // zero writes
    expect(existsSync(join(dir, VERSION_PAGE))).toBe(false); // no version page
    expect(existsSync(join(dir, "llms.txt"))).toBe(false); // build was skipped
  });

  test(
    "stale-CHANGELOG guard: warns loudly on stderr but exits 0 with zero writes",
    { timeout: 60_000 },
    () => {
      const dir = freshDir();
      // The stale-CHANGELOG shape: already on main, the newest mainline entry (3.4.0)
      // is already on its version page, yet the Alpha page STILL carries staged content
      // (the release commit that would add a NEWER `## [X.Y.Z]` wasn't pulled). Alpha
      // here carries NO branch/space URLs, so the URL pass has nothing to flip — the
      // only thing that could write is promotion, and the guard suppresses it, letting
      // us assert BOTH exit 0 and zero writes.
      makeFixture(dir, { branch: "main", alpha: "staged" });
      write(
        dir,
        ALPHA_PAGE,
        [
          "---",
          "title: Alpha",
          "description: Unreleased changes on the prerelease (alpha) line.",
          "---",
          "",
          "# Alpha",
          "",
          '{% hint style="warning" %}',
          "**Unreleased.** Preview only.",
          "{% endhint %}",
          "",
          "## FHE runtime",
          "",
          "`createConfig` accepts a process-wide `runtime` object.",
          "",
        ].join("\n"),
      );
      write(
        dir,
        VERSION_PAGE,
        [
          "---",
          "title: 3.4.x",
          "description: Release notes for the 3.4.x line.",
          "---",
          "",
          "# 3.4.x",
          "",
          "## 3.4.0",
          "",
          "_Released 2026-07-17._",
          "",
          "The FHE runtime tuning knobs shipped.",
          "",
        ].join("\n"),
      );
      const before = snapshotTree(dir);

      const res = runNode(RETARGET, ["main"], dir);

      expectOk(res); // exit 0 preserved — a stale CHANGELOG must never block the merge
      expect(res.stderr).toMatch(/CHANGELOG\.md may be stale/);
      expect(res.stderr).toContain("3.4.0");
      expect(snapshotTree(dir)).toEqual(before); // zero writes
      expect(existsSync(join(dir, "llms.txt"))).toBe(false); // build skipped
    },
  );
});

describe("docs:retarget prerelease — never promotes", () => {
  test("staged alpha is left intact; no version page, no SUMMARY entry", () => {
    const dir = freshDir();
    makeFixture(dir, { branch: "prerelease", alpha: "staged" });

    expectOk(runNode(RETARGET, ["prerelease"], dir));

    expect(existsSync(join(dir, VERSION_PAGE))).toBe(false);
    expect(alphaHasSubstance(read(dir, ALPHA_PAGE))).toBe(true);
    expect(read(dir, "docs/gitbook/src/SUMMARY.md")).not.toContain("v3-4.md");
  });
});
