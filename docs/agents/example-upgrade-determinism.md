# Recommendation: making the AI-driven example-app upgrade converge

**Ticket:** [SDK-208](https://linear.app/zama/issue/SDK-208/investigate-non-determinism-in-the-ai-driven-example-app-upgrade)
**Status:** Recommendation (investigation outcome) — not yet implemented
**Prior art:** [PR #316](https://github.com/zama-ai/sdk/pull/316) (kept open as a draft reference; this recommendation supersedes its design)

## 1. Problem

We upgrade the apps in `examples/` to the latest SDK with an LLM-driven process. The same upgrade run twice produces slightly different output. That is inherent to LLMs, but two consequences make it worth constraining:

- **Drift between siblings.** `react-viem`, `react-ethers`, and `react-wagmi` are supposed to stay aligned. Independent non-deterministic upgrades let them diverge over time — not just in comments, but eventually in structure and logic.
- **Partner self-maintenance.** The same capability is meant to be handed to partners (e.g. Ambire) so they can keep their integration current after handoff. If the process does not converge, partner apps drift unpredictably and the "the skill keeps it current for you" promise weakens.

The ticket asks for a recommendation, not a rebuild: characterise the divergence, decide whether it matters and for what, and evaluate options for convergence.

## 2. Where the non-determinism actually comes from

It helps to separate the upgrade into two LLM-driven phases and ask where variance enters each.

| Phase           | What the model does                                                                                                | Variance introduced                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Analysis**    | Re-reads the SDK surface and the app, infers what changed between the old and new SDK, and decides what to migrate | **High and semantic.** Each run re-derives "what changed" from scratch; different runs notice different deltas, in a different order, and judge relevance differently. This is the root cause of divergence. |
| **Application** | Edits the app to match                                                                                             | **Mostly cosmetic** (wording, ordering, local style) **once the plan is fixed.** Becomes semantic only when the plan itself is vague or incomplete.                                                          |

PR #316's design runs _both_ phases per app, every run. So every app independently re-derives the delta — the highest-variance step is repeated N times with nothing shared between them. That is structurally why siblings drift: there is no common, frozen description of "what A→B means" that all apps consume.

**Cosmetic vs semantic, concretely:**

- _Cosmetic_ — comment wording, import ordering, variable naming, whether a helper is inlined or extracted. Annoying in diffs, harmless to behaviour, cheap to normalise with deterministic post-processing (format, lint, import sort).
- _Semantic_ — one app adopts a new hook, another keeps the manual path; one passes a new required option, another omits it; renamed APIs caught in one app and missed in another. These change behaviour and are what actually break the convergence and partner-handoff stories.

The semantic divergence is dominated by the **analysis** phase, not the application phase. That is the lever.

## 3. Does it matter? And for what?

Yes, but the bar differs by audience:

- **Internal example apps:** convergence matters at the **semantic** level. Siblings must end up behaviourally equivalent (same hooks, same flows). Cosmetic differences are acceptable if deterministic post-processing keeps them small.
- **Partner self-maintenance:** the bar is higher. The artifact a partner runs must be **reviewable and reproducible** before it touches their code. A partner cannot audit a fresh, run-specific chain of model reasoning; they can audit a stable migration guide.

Conclusion: we should constrain the process, and the thing to constrain is the **analysis output**, not the application style.

## 4. Recommended approach — freeze the analysis into a per-couple migration guide

Generate the "what changed" analysis **once per SDK version couple (A → B)**, as a reviewable artifact, and have the model **apply** that frozen guide to every app. The high-variance step runs once and is shared; the per-app step is the low-variance one.

```
SDK version A ──┐
                ├─► deterministic diff ──► migration guide (A→B)  ── reviewed, committed ──┐
SDK version B ──┘     (llms-full + API report)                                              │
                                                                                           ▼
                                          for each app:  apply guide(A→B)  ──►  format/lint/typecheck  ──►  PR
```

**Inputs to the diff (deterministic):**

1. `llms-full.txt` for A and for B — already produced by `pnpm llm:build` from docs, approved examples, and package READMEs.
2. **The API report for A and B** — `llms-full.txt` deliberately excludes API reports, but signature-level changes (renames, new required params, removed exports — e.g. the recent decrypt-glossary renames) are exactly the semantic deltas that must not be missed. The API report diff is added explicitly to the migration input.

**The migration guide** is the stable intermediate artifact: an ordered, explicit list of changes to apply (renamed symbols, new/changed options, adopt-this-hook instructions, removed APIs and their replacements), with enough specificity that applying it is mechanical. It is committed and reviewed once per release couple, then reused across all N apps and shared with partners verbatim.

**Why this converges:**

- The highest-variance step (deriving the delta) happens once, is human-reviewed, and is identical for every app. Siblings can no longer diverge on "what changed" because they read the same guide.
- A committed guide is diffable across releases and auditable by partners — directly serving the handoff story.
- Per-app application is the low-variance phase, and what variance remains is mostly cosmetic and absorbed by deterministic post-processing (format, lint, import sort) and typecheck/build gates.

## 5. How this differs from PR #316

PR #316 is a ~2300-line orchestrator (`scripts/examples/upgrade.mjs` + a skill + JSON analysis/impact/report artifacts + PR gating). Its review surfaced six critical bugs, many important ones, doc/code drift, and zero tests — symptoms of a process that is **too complex to set up and operate**, and, more importantly, one that **does not attack the non-determinism at its source**: it re-runs the full analysis per app and wraps the variance in heavy tooling rather than removing it.

This recommendation keeps the useful idea from #316 — a structured, JSON-first analysis artifact — but **moves it up a level**: produced once per release couple, not per app per run; reviewed as the deliverable; reused everywhere. Most of #316's orchestration, gating, and allowlist machinery becomes unnecessary because the risky, divergent step is gone.

We keep PR #316 open in draft as a reference until this approach is proven on a real version couple.

## 6. Options considered (and why not)

| Option                                                                      | Verdict                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Constrain generation only** (lower temperature, stricter prompts)         | Reduces cosmetic jitter, does nothing about per-app re-derivation of the delta. Necessary hygiene, not sufficient.                                                                                   |
| **Deterministic post-processing** (format/lint/import-sort/typecheck gates) | Strongly recommended _as a complement_ — it absorbs the residual cosmetic variance. Cannot fix semantic divergence on its own.                                                                       |
| **Golden-file / snapshot tests on app output**                              | Useful as a regression guard once apps converge; does not _produce_ convergence, and snapshots of generated apps are brittle to maintain. Revisit after the guide approach lands (overlaps SDK-172). |
| **Per-app full re-analysis** (PR #316)                                      | The status quo. Rejected as the primary mechanism — it is the source of the divergence.                                                                                                              |
| **Per-couple migration guide + apply** (this doc)                           | **Recommended.** Moves the high-variance step to once-per-couple, reviewable and shared.                                                                                                             |

## 7. Open questions to settle in the prototype (Step 2)

1. **Obtaining A's `llms-full.txt`.** Likely rebuild per version (checkout the published tag, run `pnpm llm:build`) rather than persisting an artifact per release. Pick the simplest reliable path; avoid overengineering.
2. **API report shape in the diff.** Confirm which `api-report*` artifacts to diff and how to render the diff into the guide (raw API-extractor `.api.md` diff vs a distilled changelog of breaking/added symbols).
3. **Guide format.** Markdown for human review, but consider a structured (JSON) core the application step consumes, with prose generated for the reviewer — keep one source of truth.
4. **Guide generation determinism.** The guide itself is LLM-generated; it inherits some variance. Mitigated because it is generated once, human-reviewed, and committed — but worth measuring how stable guide generation is across runs.
5. **Scope of post-processing gates** reused from existing repo tooling (`format`, `lint`, `typecheck`, build/E2E).

## 8. Next step

Prototype the `diff(llms-full + API report) → migration guide` pipeline on a **real version couple** (a recent A→B with at least one known API rename, e.g. around the decrypt-glossary changes), apply the guide to two sibling apps (`react-viem` and `react-ethers`), and measure: (a) does the guide capture the known semantic deltas, and (b) do the two apps end up behaviourally aligned. That experiment validates or refutes this recommendation before any orchestration is built.
