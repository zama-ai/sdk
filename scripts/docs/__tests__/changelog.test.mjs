import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  betaHasSubstance,
  betaReleasesSinceLastMainline,
  compareVersions,
  emptyBetaTemplate,
  hasVersionSection,
  isBetaVersion,
  newestMainline,
  parseChangelog,
  parseVersion,
  promoteChangelog,
  renderBullet,
  scaffoldChangelog,
} from "../changelog.mjs";

// ─────────────────────────────────────────────────────────────── parser ──

// Mirrors real semantic-release output: newest-first, a beta tip above the
// last mainline release, multiple typed H3 sections, a BREAKING CHANGES block
// with real squash noise (Co-Authored-By lines + a `*`-prefixed stray bullet
// that must NOT be picked up as a real bullet), and both hash-link shapes
// (`([hash]())` empty and a full commit URL).
const FIXTURE_CHANGELOG = `# Changelog

## [3.4.0-beta.6](https://github.com/zama-ai/sdk/compare/v3.4.0-beta.5...v3.4.0-beta.6) (2026-07-16)

### Code Refactoring

- **codemod:** rewrite renamed credentials config keys, flag silent drops [SDK-249] ([#544](https://github.com/zama-ai/sdk/issues/544)) ([c0c54ca]())

## [3.3.0](https://github.com/zama-ai/sdk/compare/v3.2.0...v3.3.0) (2026-07-08)

### Features

- **sdk:** add confidentialTransferAndCall to Token methods [SDK-168] ([#423](https://github.com/zama-ai/sdk/issues/423)) ([7b2b916](https://github.com/zama-ai/sdk/commit/7b2b9160000000000000000000000000000000))
- **sdk:** persist pending unshield state internally ([#497](https://github.com/zama-ai/sdk/issues/497)) ([3523b53]())

### Bug Fixes

- **sdk:** configurable + diagnosable Node worker timeouts with self-healing [SDK-237] ([#494](https://github.com/zama-ai/sdk/issues/494)) ([e572582]())

### Code Refactoring

- **sdk:** absorb the delegation-propagation window internally [SDK-241] ([#486](https://github.com/zama-ai/sdk/issues/486)) ([1bd102f]())

### ⚠ BREAKING CHANGES

- **sdk:** buildRelayer removed from public API.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

* refactor(sdk): self-register node transport handler in node() factory

Move the transport handler registration from a top-level side-effect
into the node() factory itself (lazy, runs once on first call).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
`;

describe("parseChangelog", () => {
  const releases = parseChangelog(FIXTURE_CHANGELOG);

  test("parses newest-first: beta tip then mainline release", () => {
    expect(releases).toHaveLength(2);
    expect(releases[0].version).toBe("3.4.0-beta.6");
    expect(releases[1].version).toBe("3.3.0");
  });

  test("extracts isBeta + major/minor/patch + date for the beta release", () => {
    const beta = releases[0];
    expect(beta.isBeta).toBe(true);
    expect(beta.major).toBe(3);
    expect(beta.minor).toBe(4);
    expect(beta.patch).toBe(0);
    expect(beta.date).toBe("2026-07-16");
  });

  test("extracts isBeta + major/minor/patch + date for the mainline release", () => {
    const mainline = releases[1];
    expect(mainline.isBeta).toBe(false);
    expect(mainline.major).toBe(3);
    expect(mainline.minor).toBe(3);
    expect(mainline.patch).toBe(0);
    expect(mainline.date).toBe("2026-07-08");
  });

  test("splits multiple typed H3 sections (Features / Bug Fixes / Code Refactoring)", () => {
    const mainline = releases[1];
    const types = mainline.sections.map((s) => s.type);
    expect(types).toEqual(["Features", "Bug Fixes", "Code Refactoring", "⚠ BREAKING CHANGES"]);
    expect(mainline.sections[0].bullets).toHaveLength(2);
    expect(mainline.sections[1].bullets).toHaveLength(1);
    expect(mainline.sections[2].bullets).toHaveLength(1);
  });

  test("BREAKING CHANGES section is marked lowTrust, and squash noise doesn't corrupt the real bullet", () => {
    const mainline = releases[1];
    const breaking = mainline.sections.find((s) => s.type === "⚠ BREAKING CHANGES");
    expect(breaking.lowTrust).toBe(true);
    // Only the genuine `- ` bullet is captured — the `*`-prefixed stray line and
    // the Co-Authored-By/prose noise are ignored, not merged into it.
    expect(breaking.bullets).toHaveLength(1);
    expect(breaking.bullets[0]).toMatchObject({
      scope: "sdk",
      subject: "buildRelayer removed from public API.",
    });
    expect(breaking.bullets[0].subject).not.toMatch(/Co-Authored-By|refactor\(sdk\)/);
  });

  test("bullet with an empty hash link ([h]()) parses scope/subject/PR correctly", () => {
    const bullet = releases[1].sections[0].bullets[1]; // "persist pending unshield state..."
    expect(bullet).toMatchObject({
      scope: "sdk",
      subject: "persist pending unshield state internally",
      prNumber: "497",
      linearRefs: [],
    });
    expect(bullet.hashLink).toEqual({ hash: "3523b53", url: null });
  });

  test("bullet with a full commit URL hash link parses scope/subject/PR correctly", () => {
    const bullet = releases[1].sections[0].bullets[0]; // "add confidentialTransferAndCall..."
    expect(bullet).toMatchObject({
      scope: "sdk",
      subject: "add confidentialTransferAndCall to Token methods [SDK-168]",
      prNumber: "423",
      linearRefs: ["SDK-168"],
    });
    expect(bullet.hashLink).toEqual({
      hash: "7b2b916",
      url: "https://github.com/zama-ai/sdk/commit/7b2b9160000000000000000000000000000000",
    });
  });

  test("multiple Linear refs in one subject are all captured", () => {
    const withTwoRefs = parseChangelog(`## [1.0.0](url) (2026-01-01)

### Features

- **sdk:** typed causes [SDK-239][SDK-236] ([#489](url))
`);
    expect(withTwoRefs[0].sections[0].bullets[0].linearRefs).toEqual(["SDK-239", "SDK-236"]);
  });
});

describe("parseVersion / isBetaVersion", () => {
  test("parses core + prerelease", () => {
    expect(parseVersion("3.4.0-beta.6")).toEqual({
      major: 3,
      minor: 4,
      patch: 0,
      prerelease: "beta.6",
    });
    expect(parseVersion("3.3.0")).toEqual({ major: 3, minor: 3, patch: 0, prerelease: null });
  });

  test("returns null for an unparseable version", () => {
    expect(parseVersion("not-a-version")).toBeNull();
  });

  test("isBetaVersion only matches the -beta.N shape, not other prerelease tags", () => {
    expect(isBetaVersion("3.4.0-beta.6")).toBe(true);
    expect(isBetaVersion("3.4.0")).toBe(false);
    expect(isBetaVersion("3.4.0-alpha.1")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────── renderBullet ──

describe("renderBullet", () => {
  test("strips a [SDK-249]-style Linear ref from the subject", () => {
    const bullet = {
      scope: "codemod",
      subject: "rewrite renamed credentials config keys, flag silent drops [SDK-249]",
      prNumber: "544",
      prUrl: null,
      hashLink: null,
      linearRefs: ["SDK-249"],
      raw: "",
    };
    expect(renderBullet(bullet)).toBe(
      "- **codemod:** rewrite renamed credentials config keys, flag silent drops ([#544](https://github.com/zama-ai/sdk/issues/544))",
    );
  });

  test("strips a parenthesized (SDK-xxx) ref", () => {
    const bullet = {
      scope: null,
      subject: "improve retry logic (SDK-241)",
      prNumber: null,
      prUrl: null,
      hashLink: null,
      linearRefs: ["SDK-241"],
      raw: "",
    };
    expect(renderBullet(bullet)).toBe("- improve retry logic");
  });

  test("strips a bare SDK-xxx ref and collapses the resulting double space", () => {
    const bullet = {
      scope: null,
      subject: "fix bug SDK-99 in parser",
      prNumber: null,
      prUrl: null,
      hashLink: null,
      linearRefs: ["SDK-99"],
      raw: "",
    };
    expect(renderBullet(bullet)).toBe("- fix bug in parser");
  });
});

// ─────────────────────────────────────────────────── ordering / selection ──

describe("compareVersions", () => {
  test("orders ascending across minor lines", () => {
    expect(compareVersions("3.3.0", "3.4.0")).toBeLessThan(0);
    expect(compareVersions("3.4.0", "3.3.0")).toBeGreaterThan(0);
  });

  test("a mainline release outranks its own beta prereleases (same core version)", () => {
    expect(compareVersions("3.4.0", "3.4.0-beta.6")).toBeGreaterThan(0);
    expect(compareVersions("3.4.0-beta.6", "3.4.0")).toBeLessThan(0);
  });

  test("orders beta builds numerically, not lexicographically", () => {
    expect(compareVersions("3.4.0-beta.2", "3.4.0-beta.10")).toBeLessThan(0);
  });
});

describe("newestMainline / betaReleasesSinceLastMainline", () => {
  test("newestMainline picks the first non-beta release from a newest-first list", () => {
    const releases = [
      { version: "3.4.0-beta.6", isBeta: true },
      { version: "3.3.0", isBeta: false },
    ];
    expect(newestMainline(releases).version).toBe("3.3.0");
  });

  test("newestMainline returns null when there is no mainline release yet", () => {
    expect(newestMainline([{ version: "3.4.0-beta.1", isBeta: true }])).toBeNull();
  });

  test("betaReleasesSinceLastMainline stops at the first mainline release, ignoring older betas beyond it", () => {
    const releases = [
      { version: "3.4.0-beta.6", isBeta: true },
      { version: "3.4.0-beta.5", isBeta: true },
      { version: "3.3.0", isBeta: false },
      { version: "3.3.0-beta.1", isBeta: true }, // older beta, past the mainline boundary
    ];
    const betas = betaReleasesSinceLastMainline(releases);
    expect(betas.map((r) => r.version)).toEqual(["3.4.0-beta.6", "3.4.0-beta.5"]);
  });

  test("returns [] when the changelog opens on a mainline release (no unreleased tip)", () => {
    expect(betaReleasesSinceLastMainline([{ version: "3.3.0", isBeta: false }])).toEqual([]);
  });
});

describe("hasVersionSection", () => {
  test("finds a `## {version}` heading", () => {
    expect(hasVersionSection("# 3.x\n\n## 3.4.0\n\nnotes\n", "3.4.0")).toBe(true);
  });

  test("is false when the version isn't documented on the page", () => {
    expect(hasVersionSection("# 3.x\n\n## 3.4.0\n\nnotes\n", "3.4.1")).toBe(false);
  });
});

describe("betaHasSubstance", () => {
  test("the freshly-reset template has no substance", () => {
    expect(betaHasSubstance(emptyBetaTemplate())).toBe(false);
  });

  test("real staged prose counts as substance", () => {
    const staged = `${emptyBetaTemplate()}\n## New feature\n\nSome real notes.\n`;
    expect(betaHasSubstance(staged)).toBe(true);
  });

  test("comment noise that survives a single strip pass is not substance", () => {
    // A single `<!--...-->` removal on this leaves `<!-- R -->` behind (the
    // outer `<!-` joins the trailing `-->`); only stripping until stable empties
    // it. Regression for the incomplete-multi-character-sanitization fix.
    const noise = `${emptyBetaTemplate()}\n<!-<!--x-->- R -->\n`;
    expect(betaHasSubstance(noise)).toBe(false);
  });
});

// ──────────────────────────────────────────────── promoteChangelog (unit) ──

const tmpRoots = [];

afterEach(() => {
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop(), { recursive: true, force: true });
  }
});

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "changelog-promote-"));
  tmpRoots.push(root);
  return root;
}

const CHANGELOG_DIR = "docs/gitbook/src/changelog";

const SUMMARY_FIXTURE = `# Table of contents

## Changelog

- [3.x](changelog/v3.md)
`;

const V3_INDEX_FIXTURE = `---
title: 3.x
description: Release notes for the 3.x line.
---

# 3.x

## Versions

- [**3.3.x**](v3-3.md) — Release notes for the 3.3.x line.
`;

const CHANGELOG_MD_FIXTURE = `# Changelog

## [3.4.0](https://github.com/zama-ai/sdk/compare/v3.3.0...v3.4.0) (2026-07-16)

### Features

- **sdk:** expose wrap() + useWrap for two-signature shield ([#522](https://github.com/zama-ai/sdk/issues/522)) ([5bb88a9]())

## [3.3.0](https://github.com/zama-ai/sdk/compare/v3.2.0...v3.3.0) (2026-07-08)

### Features

- **sdk:** add confidentialTransferAndCall to Token methods ([#423](https://github.com/zama-ai/sdk/issues/423)) ([7b2b916]())
`;

const STAGED_BETA_FIXTURE = `---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (\`beta\`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

## wrap() for two-signature shield

\`WrappedToken.shield()\` now supports ERC-1363 tokens requiring two signatures.
`;

/** A minimal, valid GitBook + CHANGELOG.md tree, not yet promoted: a mainline
 *  3.4.0 release exists in CHANGELOG.md, no v3-4.md page yet, and the Beta
 *  page carries genuine staged prose. */
function writeFreshFixture(root) {
  mkdirSync(join(root, CHANGELOG_DIR), { recursive: true });
  writeFileSync(join(root, "CHANGELOG.md"), CHANGELOG_MD_FIXTURE);
  writeFileSync(join(root, "docs/gitbook/src/SUMMARY.md"), SUMMARY_FIXTURE);
  writeFileSync(join(root, `${CHANGELOG_DIR}/v3.md`), V3_INDEX_FIXTURE);
  writeFileSync(join(root, `${CHANGELOG_DIR}/beta.md`), STAGED_BETA_FIXTURE);
}

describe("promoteChangelog", () => {
  test("fresh-beta fixture: promotes, creates the version page, resets beta", () => {
    const root = makeRoot();
    writeFreshFixture(root);

    const result = promoteChangelog({ root });

    expect(result.promoted).toBe(true);
    expect(result.version).toBe("3.4.0");
    expect(result.changed.length).toBeGreaterThan(0);

    const versionPage = readFileSync(join(root, `${CHANGELOG_DIR}/v3-4.md`), "utf8");
    expect(hasVersionSection(versionPage, "3.4.0")).toBe(true);
    expect(versionPage).toContain("_Released 2026-07-16._");
    // Beta prose was carried over, demoted one heading level (## → ###).
    expect(versionPage).toContain("### wrap() for two-signature shield");

    const summary = readFileSync(join(root, "docs/gitbook/src/SUMMARY.md"), "utf8");
    expect(summary).toContain("changelog/v3-4.md");

    const index = readFileSync(join(root, `${CHANGELOG_DIR}/v3.md`), "utf8");
    expect(index).toContain("(v3-4.md)");

    const beta = readFileSync(join(root, `${CHANGELOG_DIR}/beta.md`), "utf8");
    expect(betaHasSubstance(beta)).toBe(false);
  });

  test("already-promoted fixture (target `## {version}` already present): no-op, zero writes", () => {
    const root = makeRoot();
    writeFreshFixture(root);
    // Pre-seed the version page as if promotion already happened.
    mkdirSync(join(root, CHANGELOG_DIR), { recursive: true });
    writeFileSync(
      join(root, `${CHANGELOG_DIR}/v3-4.md`),
      `---
title: 3.4.x
description: Release notes for the 3.4.x line.
---

# 3.4.x

## 3.4.0

_Released 2026-07-16._

Already-written plain-language notes.
`,
    );

    const result = promoteChangelog({ root });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe("already promoted");
    expect(result.changed).toEqual([]);
  });

  test("already-promoted fixture (beta already at the reset template): no-op, zero writes", () => {
    const root = makeRoot();
    writeFreshFixture(root);
    // No version page yet, but nothing is staged on Beta (secondary guard).
    writeFileSync(join(root, `${CHANGELOG_DIR}/beta.md`), emptyBetaTemplate());

    const result = promoteChangelog({ root });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe("beta page is empty");
    expect(result.changed).toEqual([]);
  });

  test("calling promoteChangelog twice: the second call is a true no-op", () => {
    const root = makeRoot();
    writeFreshFixture(root);

    const first = promoteChangelog({ root });
    expect(first.promoted).toBe(true);

    const versionPageAfterFirst = readFileSync(join(root, `${CHANGELOG_DIR}/v3-4.md`), "utf8");
    const betaAfterFirst = readFileSync(join(root, `${CHANGELOG_DIR}/beta.md`), "utf8");

    const second = promoteChangelog({ root });

    expect(second.promoted).toBe(false);
    expect(second.reason).toBe("already promoted");
    expect(second.changed).toEqual([]);

    // Disk state is byte-identical after the no-op second call.
    expect(readFileSync(join(root, `${CHANGELOG_DIR}/v3-4.md`), "utf8")).toBe(
      versionPageAfterFirst,
    );
    expect(readFileSync(join(root, `${CHANGELOG_DIR}/beta.md`), "utf8")).toBe(betaAfterFirst);
  });
});

/** relpath → bytes for every FILE under `root`. Guards `isFile()` so a booby-trap
 *  directory named `*.md` (used to force a throw) doesn't make the snapshot itself
 *  blow up on `readFileSync`, and is naturally excluded from the file map. */
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

const PRE_PROMOTED_V3_4 = `---
title: 3.4.x
description: Release notes for the 3.4.x line.
---

# 3.4.x

## 3.4.0

_Released 2026-07-16._

Already-written plain-language notes.
`;

// ─────────────────────────────────────── stale-CHANGELOG warning (Fix #1) ──

describe("promoteChangelog — stale-CHANGELOG.md warning", () => {
  test("warns (but stays a no-op, zero writes) when already-promoted AND beta still has substance", () => {
    const root = makeRoot();
    writeFreshFixture(root); // beta carries genuine staged prose
    // The newest mainline entry (3.4.0) is already on its page — the state the guard
    // reaches when CHANGELOG.md is stale (the release commit adding a NEWER `## [X.Y.Z]`
    // wasn't pulled), so `target` derived to the prior, already-promoted version.
    writeFileSync(join(root, `${CHANGELOG_DIR}/v3-4.md`), PRE_PROMOTED_V3_4);
    const before = snapshotTree(root);

    const result = promoteChangelog({ root });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe("already promoted");
    expect(result.changed).toEqual([]); // zero writes — no-op-safe
    expect(result.warning).toMatch(/CHANGELOG\.md may be stale/);
    expect(result.warning).toContain("3.4.0");
    // Nothing on disk changed (warning ≠ mutation).
    expect(snapshotTree(root)).toEqual(before);
  });

  test("does NOT warn on a legitimate idempotent re-run (beta already reset to empty)", () => {
    const root = makeRoot();
    writeFreshFixture(root);
    // Genuine already-promoted state: version page present AND beta reset — a true no-op.
    writeFileSync(join(root, `${CHANGELOG_DIR}/v3-4.md`), PRE_PROMOTED_V3_4);
    writeFileSync(join(root, `${CHANGELOG_DIR}/beta.md`), emptyBetaTemplate());

    const result = promoteChangelog({ root });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe("already promoted");
    expect(result.warning).toBeUndefined();
  });
});

// ────────────────────── self-referential + sibling anchor repointing (Fix #2/#6) ──

describe("promoteChangelog — anchor repointing in the moved prose", () => {
  const BETA_WITH_SELF_REFS = `---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** Preview only.
{% endhint %}

## Runtime tuning

See [error handling](beta.md#error-handling) and the [runtime notes](./beta.md#runtime-tuning) for caveats. Not the sibling [mybeta](mybeta.md#sibling) doc.

## Error handling

Errors now carry typed causes.
`;

  test("self-referential `](beta.md#…)` / `](./beta.md#…)` links are repointed to the version page", () => {
    const root = makeRoot();
    writeFreshFixture(root);
    writeFileSync(join(root, `${CHANGELOG_DIR}/beta.md`), BETA_WITH_SELF_REFS);

    const result = promoteChangelog({ root });
    expect(result.promoted).toBe(true);

    const versionPage = readFileSync(join(root, `${CHANGELOG_DIR}/v3-4.md`), "utf8");
    // Both self-refs now point at the version page (same changelog/ dir), not beta.md
    // (which just reset — those links would dangle without the fix). The `./` prefix is
    // preserved on the one that carried it.
    expect(versionPage).toContain("(v3-4.md#error-handling)");
    expect(versionPage).toContain("(./v3-4.md#runtime-tuning)");
    expect(versionPage).not.toContain("(beta.md#"); // no un-repointed self-ref remains
    // Fix #6 boundary: the sibling `mybeta.md#…` is NOT a match and stays put.
    expect(versionPage).toContain("(mybeta.md#sibling)");
  });

  test("inbound `](mybeta.md#slug)` on another page is left alone (path-boundary)", () => {
    const root = makeRoot();
    writeFreshFixture(root);
    // A page whose inbound links include BOTH the real beta.md anchor and a sibling
    // `mybeta.md` that merely ends in `beta.md#…`. The moved prose owns `#wrap-…`.
    const sibling = `# Sibling

Real: [wrap notes](beta.md#wrap-for-two-signature-shield).
Decoy: [other](mybeta.md#wrap-for-two-signature-shield).
`;
    writeFileSync(join(root, `${CHANGELOG_DIR}/v3-2.md`), sibling);

    const result = promoteChangelog({ root });
    expect(result.promoted).toBe(true);

    const page = readFileSync(join(root, `${CHANGELOG_DIR}/v3-2.md`), "utf8");
    expect(page).toContain("(v3-4.md#wrap-for-two-signature-shield)"); // real link repointed
    expect(page).toContain("(mybeta.md#wrap-for-two-signature-shield)"); // decoy untouched
    expect(page).not.toContain("(myv3-4.md#"); // old bug would have corrupted it to this
  });
});

// ─────────────────────────────────── atomic failure isolation (Fix #4) ──

describe("promoteChangelog — atomic failure isolation", () => {
  test("a throw AFTER edits are staged (during the anchor sweep) writes NOTHING to disk", () => {
    const root = makeRoot();
    writeFreshFixture(root); // beta has a heading ⇒ repointBetaAnchors runs (no early return)
    // Booby-trap: a DIRECTORY named `*.md` under the docs tree. The anchor sweep runs
    // AFTER the version page / reset beta / SUMMARY / index edits are staged in memory
    // but BEFORE flush(); readFileSync on a directory throws EISDIR mid-sweep. Because
    // flush() is not atomic across files, "tree byte-identical after a throw" can only
    // hold if the throw lands in the compute phase — which is exactly what this asserts
    // (and what the existing parseChangelog(null) test, which throws before any staging,
    // does not).
    mkdirSync(join(root, "docs/gitbook/src/trap.md"), { recursive: true });
    const before = snapshotTree(root);

    expect(() => promoteChangelog({ root })).toThrow(/EISDIR/);

    // No version page created, beta not reset, SUMMARY/index untouched: fully atomic.
    expect(existsSync(join(root, `${CHANGELOG_DIR}/v3-4.md`))).toBe(false);
    expect(snapshotTree(root)).toEqual(before);
  });
});

// ──────────────────────────────── descriptive CHANGELOG.md error (Fix #5) ──

describe("promoteChangelog / scaffoldChangelog — missing CHANGELOG.md", () => {
  test("throws a descriptive Error (not a raw TypeError) when CHANGELOG.md is absent", () => {
    const root = makeRoot();
    writeFreshFixture(root);
    rmSync(join(root, "CHANGELOG.md"));

    expect(() => promoteChangelog({ root })).toThrow(/CHANGELOG\.md not found\/unreadable at/);
    expect(() => scaffoldChangelog({ root })).toThrow(/CHANGELOG\.md not found\/unreadable at/);
  });
});
