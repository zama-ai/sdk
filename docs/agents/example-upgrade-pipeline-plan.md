# Implementation plan: SDK-aware app upgrade pipeline

**Ticket:** [SDK-208](https://linear.app/zama/issue/SDK-208/investigate-non-determinism-in-the-ai-driven-example-app-upgrade)
**Builds on:** [`example-upgrade-determinism.md`](./example-upgrade-determinism.md) (the recommendation this plan implements)
**Status:** Plan — not yet implemented. Supersedes the [PR #316](https://github.com/zama-ai/sdk/pull/316) design (kept open as draft reference).

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

| Layer | Responsibility | Why here |
| --- | --- | --- |
| **Deterministic CLI** (`scripts/sdk-upgrade/`) | Version resolution, diff collection, guide schema validation, post-processing gates, PR/branch output | Must be reproducible. **No LLM.** Small and unit-tested — this is what keeps the process from re-bloating like #316. |
| **Two skills** | `sdk-upgrade-generate-guide` (Half 1 LLM step), `sdk-upgrade-apply-guide` (Half 2 LLM step) | The only judgement steps. Each is bounded by a frozen artifact (diff bundle in, guide out / guide in, edits out). |
| **Slash command** `/sdk-upgrade` | Thin interactive wrapper orchestrating CLI + skill inside Claude Code | Ergonomics; no logic of its own. |

External apps consume the **`apply` skill + committed guides**, distributed through the existing `npx skills add` channel ([SDK-64](https://linear.app/zama/issue/SDK-64/create-ai-coding-skills-for-external-sdk-integrators-npx-skills-add)). Partners apply guides; they never regenerate them.

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
  "kind": "rename",                  // rename | signature-change | new-required-option | removed-api | adopt-hook | config-change
  "appliesTo": "@zama-fhe/sdk",      // package / import the change touches
  "from": "...", "to": "...",        // old → new symbol / signature / option
  "detection": "call sites of <X>",  // how the apply step locates affected code
  "action": "mechanical instruction",
  "severity": "required",            // required | recommended
  "references": ["<source_url into llms-full / api report>"]
}
```

`required` changes that the apply step cannot resolve block a "ready" PR (surfaced explicitly); `recommended` ones are reported but non-blocking.

## Version-selection rule (external apps)

A partner's installed version may not exactly match any committed guide's `from`. Rule: pick the guide whose `from` is the nearest published version **≤** the app's installed version, targeting B; if none exists, fall back to generating the couple on demand (SDK-side) and committing it. (Open item — settle in Phase 4.)

## Repo layout

```
scripts/sdk-upgrade/
  cli.mjs
  lib/resolve-version.mjs
  lib/collect-diff.mjs        # git show + api diff (reuses diff.mjs) + changelog slice
  lib/guide-schema.mjs        # validate(guide)
  lib/post-process.mjs        # deterministic gates
  lib/pr.mjs
  __tests__/
migrations/
  <A>__<B>.json
  <A>__<B>.md
skills/sdk-upgrade-generate-guide/SKILL.md
skills/sdk-upgrade-apply-guide/SKILL.md
# /sdk-upgrade command registered with the Zama plugin
```

## Phasing

- **Phase 0 — deterministic core, no LLM.** Scaffold the CLI + `collect-diff` producing the input bundle for a real couple; print/persist it. Fully unit-testable. Proves artifact retrieval (incl. the `git show` / rebuild fallback) end to end.
- **Phase 1 — `generate-guide` skill + schema.** Produce the first guide for a real couple with a known API rename (decrypt-glossary). Human review of the guide is the gate.
- **Phase 2 — `apply-guide` skill + gates (the prototype experiment).** Apply the guide to **both `react-viem` and `react-ethers`** and measure: (a) does it capture the known semantic deltas, (b) do the two apps end up behaviourally aligned. This validates or refutes the whole recommendation.
- **Phase 3 — PR automation + `/sdk-upgrade` command.** Wire output to PRs (file allowlist, `assertSafeBranch`); add the thin slash command.
- **Phase 4 — external distribution.** Bundle the `apply` skill + committed guides for `npx skills add`; settle the version-selection rule; document the partner workflow.

## Testing

- Unit (deterministic): version resolution, diff collection, guide schema validation, guide selection, post-processing argv. This is the coverage #316 lacked.
- LLM steps: validated first by the Phase 2 convergence check, later by promptfoo evals (overlaps [SDK-172](https://linear.app/zama/issue/SDK-172/skills-evals-with-promptfoo)).
- Optional later: golden-file/snapshot guard on app output, once apps have converged.

## Risks

- **Guide-generation variance.** The guide is LLM-generated, so it inherits some variance — mitigated by generate-once + human review + commit. Measure stability across runs in Phase 1.
- **`llms-full.txt` missing at some tags.** Confirmed: e.g. `v3.0.1` has `api.md` but not `llms-full.txt`. Handle via the checkout + `pnpm llm:build` fallback; the `api.md` diff alone still carries the semantic signal.
- **API-extractor format drift across versions** could add noise to the `.api.md` diff. Acceptable — it is reviewed once per couple.
- **External version mismatch** (no exact `from` guide) — see the version-selection rule; finalise in Phase 4.
