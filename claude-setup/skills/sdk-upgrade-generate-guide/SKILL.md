---
name: sdk-upgrade-generate-guide
description: "Generate the per-couple SDK migration guide (SDK-208, Half 1). Use when upgrading example or partner apps from one @zama-fhe/sdk version (A) to another (B) and a guide for that couple does not yet exist under migrations/. Reads the deterministic diff bundle produced by `pnpm sdk-upgrade guide --from <A> --to <B>` and emits a schema-valid migrations/<A>__<B>.json plus a human-readable .md. This is the convergence artifact: generated once per couple, reviewed, committed, then applied unchanged to every app."
---

# Generate an SDK migration guide (A → B)

You are **Half 1** of the SDK-upgrade pipeline. Your only job: turn the deterministic A→B diff bundle into a **frozen, reviewable migration guide**. You do **not** touch any app — that is the apply skill's job (`sdk-upgrade-apply-guide`).

The guide is generated **once per (A,B) couple** and then applied identically to N apps. That is the entire point: freezing the high-variance "what changed" analysis into one reviewed artifact is what makes the downstream upgrades converge instead of drift.

## Inputs

The deterministic CLI has already run `pnpm sdk-upgrade guide --from <A> --to <B>` and written a bundle to `.tmp/sdk-upgrade/<A>__<B>/`:

| File             | What it carries                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bundle.json`    | Manifest: which inputs changed, byte sizes, refs/versions. **Read this first.**                                                                    |
| `llms-full.diff` | Unified diff of `llms-full.txt` — docs + approved examples + READMEs. The _usage-level_ signal.                                                    |
| `api/<pkg>.diff` | Per-package `*.api.md` diffs from api-extractor. The _signature-level_ signal — renames, signature changes, removals, **including class members**. |
| `changelog.diff` | The `CHANGELOG.md` slice between A and B. Human intent + PR references.                                                                            |

## Hard rules

1. **Read the ENTIRE bundle, not just export lines.** Do not grep for `export` and stop. The most dangerous deltas hide in **class-member** changes inside `api/*.diff` (e.g. a method removed from `class ZamaSDK`) and in changelog prose. A real prototype run missed `ZamaSDK.requireSigner` being removed precisely because the generate step skimmed top-level exports only. Read every changed `api/*.diff` in full, and read `changelog.diff` in full.
2. **Output must validate against the schema.** After writing, the operator runs `pnpm sdk-upgrade guide --validate migrations/<A>__<B>.json`. If it fails, fix the JSON. The validator is in `scripts/sdk-upgrade/lib/guide-schema.mjs`.
3. **Describe, don't apply.** Each change is a _mechanical instruction_ for the apply skill. Never edit app code here.
4. **Completeness over brevity.** A breaking change no app currently imports is still listed as `required` — a future app might use it. Mark genuinely additive things `recommended`.
5. **Idempotent actions.** Write each `action` so that applying it to an app already partly migrated is a safe no-op (e.g. "rename X to Y; if already Y, skip").

## Output: `migrations/<A>__<B>.json`

```jsonc
{
  "schemaVersion": 1,
  "from": "<A>", // exact version, e.g. "3.0.0-alpha.32"
  "to": "<B>",
  "fromRef": "v<A>",
  "toRef": "v<B>",
  "generatedFrom": {
    // provenance — which bundle files you used
    "llmsFullDiff": "llms-full.diff",
    "apiReportDiffs": ["api/sdk.diff", "api/react-sdk.diff", "..."],
    "changelogDiff": "changelog.diff",
  },
  "note": "one line: how generated + any caveats",
  "changes": [
    {
      "id": "kebab-case-stable-id",
      "kind": "rename | signature-change | new-required-option | removed-api | new-api | adopt-hook | config-change",
      "appliesTo": "@zama-fhe/sdk", // package / entry the change touches
      "from": "old symbol or signature",
      "to": "new symbol or signature",
      "affectedSymbols": ["optional", "list", "of", "exact", "names"],
      "detection": "how the apply step locates affected code",
      "action": "mechanical, idempotent instruction",
      "severity": "required | recommended",
      "references": ["api/sdk.diff", "changelog.diff#anchor"],
    },
  ],
}
```

`affectedSymbols` is optional but strongly preferred for renames and signature changes — it makes the apply step's detection grep-able and unambiguous.

## Output: `migrations/<A>__<B>.md`

Human-readable companion for review. Group changes by package, show a representative before/after snippet per change pulled from the diffs, and add a short **idempotency note** explaining that the guide is safe to re-apply. Keep prose terse (the reviewer dislikes noisy AI commentary). The committed pair `migrations/3.0.0-alpha.32__3.1.0-alpha.5.{json,md}` is the reference shape.

## Procedure

1. Read `bundle.json` to see what changed and the exact A/B versions and refs.
2. Read every changed `api/*.diff` **in full** — top-level exports _and_ class members. This is the authoritative signature signal.
3. Read `changelog.diff` in full for intent and PR references; cross-reference each entry against the api diffs.
4. Skim `llms-full.diff` for usage-pattern shifts (how examples call the API) that the api diff alone doesn't convey.
5. Synthesize one `change` entry per distinct breaking or noteworthy delta. Assign stable kebab-case ids and `required`/`recommended`.
6. Write the `.json` and `.md` under `migrations/`.
7. **Run the completeness lint** against the bundle and close the gaps:
   `pnpm sdk-upgrade guide --validate migrations/<A>__<B>.json --bundle <bundleDir>`
   It prints `Coverage: N/M changed public exports referenced` and lists every
   changed public export **not** named by any change. For each uncovered symbol,
   decide: is it a real public-API delta a consumer could hit? If yes, add a
   change for it (or fold it into an existing one so its name appears). Only leave
   it uncovered if it is genuinely internal/no-op, and say so. Drive coverage as
   high as the real public surface allows — this is the deterministic check that
   bounds the long-tail variance between generation runs.
8. Tell the operator to review the `.md` before committing.

## You are done when

- `migrations/<A>__<B>.json` validates, and
- the completeness lint has been run and every uncovered public export is either covered or explicitly justified as internal/no-op, and
- `migrations/<A>__<B>.md` lists every change with a before/after snippet, and
- you have **explicitly confirmed** you read each changed `api/*.diff` and `changelog.diff` in full (state this in your summary).
