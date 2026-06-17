# Implementation plan: SDK-aware app upgrade pipeline

**Builds on:** [`example-upgrade-determinism.md`](./example-upgrade-determinism.md) (the recommendation this plan implements)
**Status:** Phases 0–4 implemented — deterministic CLI (`guide`/`apply`/`dist`) + both skills + `/sdk-upgrade` command + completeness lint + external skill bundle. Convergence validated on react-viem (#404) and react-ethers (#410). Supersedes the [PR #316](https://github.com/zama-ai/sdk/pull/316) design (kept open as draft reference).

## Goal

One capability that upgrades an app using the SDK from its current version (**A**) to a target version (**B**), reproducibly enough that sibling example apps — and external partner apps using the same capability — converge instead of drift. Works for in-repo `examples/*` first, external apps second.

## Core idea (from the recommendation)

Split the upgrade into a **deterministic core** and **two bounded LLM steps**, with a **frozen, reviewed migration guide** between them. The high-variance step ("what changed A→B") runs **once per version couple**, is reviewed and committed, and is then applied identically to every app.

```
                ┌──────────────── Half 1: generate guide (once per A→B) ───────────────┐
 git tag A ─┐   │  deterministic diff bundle            one bounded LLM step           │
            ├──►│  (llms-full diff + api.md diff   ──►  generate-migration-guide  ──►   │──► migrations/<A>__<B>.{json,md}
 git tag B ─┘   │   + changelog slice)                  (structured guide)              │      (reviewed, committed)
                └──────────────────────────────────────────────────────────────────────┘                 │
                                                                                                          ▼
                ┌──────────────── Half 2: apply guide (per app) ──────────────────────┐
 app + B ──────►│  apply-migration-guide  ──►  deterministic gates  ──►  PR / branch   │◄── reads frozen guide
                │  (LLM applies frozen plan)   (bump, format, lint,                    │
                │                               typecheck, build, E2E)                 │
                └──────────────────────────────────────────────────────────────────────┘
```

## Layering (decided)

| Layer                                          | Responsibility                                                                                        | Why here                                                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Deterministic CLI** (`scripts/sdk-upgrade/`) | Version resolution, diff collection, guide schema validation, post-processing gates, PR/branch output | Must be reproducible. **No LLM.** Small and unit-tested — this is what keeps the process from re-bloating like #316. |
| **Two skills**                                 | `sdk-upgrade-generate-guide` (Half 1 LLM step), `sdk-upgrade-apply-guide` (Half 2 LLM step)           | The only judgement steps. Each is bounded by a frozen artifact (diff bundle in, guide out / guide in, edits out).    |
| **Slash command** `/sdk-upgrade`               | Thin interactive wrapper orchestrating CLI + skill inside Claude Code                                 | Ergonomics; no logic of its own.                                                                                     |

External apps consume the **`apply` skill + committed guides**, distributed through the existing `npx skills add` channel. Partners apply guides; they never regenerate them.

## What we reuse (already in the repo)

- **`scripts/api-report/diff.mjs`** — generic `--base-dir`/`--pr-dir` diff over `*.api.md`. Use it directly for the A→B API surface diff.
- **Committed artifacts per tag** — `llms-full.txt` and `packages/*/etc/*.api.md` are committed, so version A's surface is `git show vA:<path>` with no rebuild. (Caveat below.)
- **`pnpm llm:build`** — fallback to regenerate `llms-full.txt` at a tag when it is missing there.
- **From PR #316, keep the good parts:** JSON-first artifacts, per-invocation audit trail, PR file allowlist, `assertSafeBranch`. **Drop:** per-app re-analysis, multi-analyst passes, heavy PR gating.

## Deterministic CLI surface

```sh
# Half 1 — once per couple
pnpm sdk-upgrade guide --from <A> --to <B> [--out migrations/]

# Half 2 — per app
pnpm sdk-upgrade apply --example react-viem --to <B>     # in-repo app
pnpm sdk-upgrade apply --app <path> --to <B>             # external app
```

`guide` substeps (all deterministic except step 4):

1. Resolve `--from`/`--to` to git tags + npm versions (`latest` → `dist-tags.latest`; never "newest publish time" — that was a #316 bug).
2. Collect version A and B artifacts: `git show v<A>:llms-full.txt` etc.; fall back to checkout + `pnpm llm:build` if absent at that tag.
3. Build the **input bundle**: `llms-full.diff` (unified), `api/<pkg>.api.md.diff` (via `diff.mjs`), `changelog` slice between A and B.
4. **LLM step** (`generate-migration-guide` skill): bundle in → structured guide out.
5. Validate guide against schema; write `migrations/<A>__<B>.json` + human `.md`.

`apply` substeps:

1. Select the applicable guide for (app's current version → B); see version-selection rule below.
2. **LLM step** (`apply-migration-guide` skill): apply the frozen guide to the app. The skill is forbidden from re-deriving deltas — it only applies listed changes and reports unresolved ones.
3. Deterministic gates: bump `package.json` deps + lockfile, `pnpm format`, lint, typecheck, build, app E2E.
4. Output: open PR (in-repo) or write a branch/patch (external).

## Migration guide schema (the convergence artifact)

JSON core (machine-applied) + generated prose (`.md`, for review). Each change:

```jsonc
{
  "id": "decrypt-glossary-rename-userDecrypt",
  "kind": "rename", // rename | signature-change | new-required-option | removed-api | adopt-hook | config-change
  "appliesTo": "@zama-fhe/sdk", // package / import the change touches
  "from": "...",
  "to": "...", // old → new symbol / signature / option
  "detection": "call sites of <X>", // how the apply step locates affected code
  "action": "mechanical instruction",
  "severity": "required", // required | recommended
  "references": ["<source_url into llms-full / api report>"],
}
```

`required` changes that the apply step cannot resolve block a "ready" PR (surfaced explicitly); `recommended` ones are reported but non-blocking.

## Version-selection rule (external apps)

A partner's installed version may not exactly match any committed guide's `from`. Rule: pick the guide whose `from` is the nearest published version **≤** the app's installed version, targeting B; if none exists, fall back to generating the couple on demand (SDK-side) and committing it. (Open item — settle in Phase 4.)

## Repo layout

```
scripts/sdk-upgrade/
  cli.mjs                     # `guide` + `apply` subcommands (no LLM)
  lib/semver.mjs              # publish-shape version compare (X.Y.Z[-alpha.N])
  lib/resolve-version.mjs     # spec -> { version, gitRef }; dist-tags via registry
  lib/collect-diff.mjs        # git show + unified diff of llms-full + api reports + changelog
  lib/guide-schema.mjs        # validateGuide() + selectGuide()
  lib/app.mjs                 # locate app, read/bump pins (deterministic gates)
  __tests__/                  # unit coverage for every pure helper
migrations/
  <A>__<B>.json
  <A>__<B>.md
claude-setup/skills/sdk-upgrade-generate-guide/SKILL.md   # synced to .claude/ by `pnpm setup:claude`
claude-setup/skills/sdk-upgrade-apply-guide/SKILL.md
claude-setup/commands/sdk-upgrade.md                      # the /sdk-upgrade slash command
```

The skills and command live under `claude-setup/` (the repo's existing skill source) rather than a repo-root `skills/`, so `pnpm setup:claude` installs them alongside the other agent skills. External distribution (Phase 4) repackages the apply skill + committed guides for `npx skills add`.

## Phasing

- **Phase 0 — deterministic core, no LLM.** Scaffold the CLI + `collect-diff` producing the input bundle for a real couple; print/persist it. Fully unit-testable. Proves artifact retrieval (incl. the `git show` / rebuild fallback) end to end.
- **Phase 1 — `generate-guide` skill + schema.** Produce the first guide for a real couple with a known API rename (decrypt-glossary). Human review of the guide is the gate.
- **Phase 2 — `apply-guide` skill + gates (the prototype experiment). Done — recommendation validated.** The same frozen guide was applied to `react-viem` (#404) and `react-ethers` (#410). Both typecheck clean against B; react-ethers passed the gate on the first apply (no missed sites, no guide gaps), where react-viem had needed two post-gate fixes that the guide has since absorbed. Every migrated hook call-site reaches an **identical API shape** across the two apps — semantic convergence. The only residual difference was line-wrapping, which `oxfmt` collapses to **byte-identical** source; this is why the gate now runs `format` before `typecheck`, not just `typecheck`.
- **Phase 3 — PR automation + `/sdk-upgrade` command.** Wire output to PRs (file allowlist, `assertSafeBranch`); add the thin slash command.
- **Phase 4 — external distribution. Done.** `pnpm sdk-upgrade dist` assembles a self-contained bundle (portable apply-guide `SKILL.md` + every committed guide + `guides/index.json`) for publishing to the `zama-ai/skills` marketplace / `npx skills add`. The apply skill is now dual-mode: in-repo it uses the CLI, externally it selects from `guides/index.json` and gates with the app's own tooling. Version-selection rule and the no-guide fallback are settled and documented in [`sdk-upgrade-distribution.md`](./sdk-upgrade-distribution.md).

## Testing

- Unit (deterministic): version resolution, diff collection, guide schema validation, guide selection, post-processing argv. This is the coverage #316 lacked.
- LLM steps: validated first by the Phase 2 convergence check, later by promptfoo evals.
- Optional later: golden-file/snapshot guard on app output, once apps have converged.

## Generation variance (measured)

Two independent cold generations of the guide for `3.0.0-alpha.32 → 3.1.0-alpha.5`, same deterministic bundle, neither seeing the other or the committed guide: **19 vs 31 changes (+63%)** — yet **both cover 100% of the 8 app-relevant core deltas** (config→`address`, permit renames, `requireSigner`→`signer`, `createZamaConfig`→`createConfig`, `Handle`→`EncryptedValue`, `EncryptResult` hex, `ReadonlyToken`→`WrappedToken`, unshield hooks). The variance lives entirely in (1) grouping granularity (split vs merged changes) and (2) the low-level long tail of internal removals no example app imports. So generate-step variance is real but **zero-impact on what reaches apps**; combined with the apply-side format+typecheck gate the end-to-end output converges, and generate-once + review + commit holds.

**Deterministic completeness lint (built).** `pnpm sdk-upgrade guide --validate <file> --bundle <dir>` mechanically extracts the changed _public_ export identifiers from the `api/*.diff` files and reports each one not referenced by any guide change (`from`/`to`/`affectedSymbols`/`action`). This turns "did the generate step cover every public delta?" from a judgment call into a number: on this couple the two generations scored **51/138 vs 100/138** referenced — the same long-tail spread, now a reviewable checklist. The generate skill runs the lint and drives coverage up; remaining gaps must be justified as internal/no-op. Advisory (warns, doesn't fail) since some long-tail exports are legitimately no-ops for any app.

## Testing

- Unit (deterministic): version resolution, diff collection, guide schema validation, guide selection, post-processing argv. This is the coverage #316 lacked.
- LLM steps: validated first by the Phase 2 convergence check, later by promptfoo evals.
- Optional later: golden-file/snapshot guard on app output, once apps have converged.

## Risks

- **Guide-generation variance.** Measured above — concentrated in the no-impact long tail, mitigated by generate-once + review + commit, and surfaced as a reviewable checklist by the deterministic completeness lint.
- **`llms-full.txt` missing at some tags.** Confirmed: e.g. `v3.0.1` has `api.md` but not `llms-full.txt`. Handle via the checkout + `pnpm llm:build` fallback; the `api.md` diff alone still carries the semantic signal.
- **API-extractor format drift across versions** could add noise to the `.api.md` diff. Acceptable — it is reviewed once per couple.
- **External version mismatch** (no exact `from` guide) — see the version-selection rule; finalise in Phase 4.
