---
name: sdk-upgrade-apply-guide
description: "Apply a frozen SDK migration guide to one app (SDK-208, Half 2). Use when upgrading an example or partner app to a newer @zama-fhe/sdk version and a guide for that couple already exists under migrations/. Applies ONLY the listed changes to the app's source, then relies on the deterministic typecheck gate (`pnpm sdk-upgrade apply --example <name> --to <B> --gate`) to catch anything missed. Forbidden from re-deriving deltas — partners and sibling apps must converge, so the guide is the single source of truth."
---

# Apply an SDK migration guide to an app (Half 2)

You are **Half 2** of the SDK-upgrade pipeline. You take a **frozen, already-reviewed** migration guide (`migrations/<A>__<B>.json`) and apply its changes to one app's source. You do **not** decide *what* changed — that was settled once, in the guide. This is what makes sibling apps and external partner apps converge instead of each re-inventing the migration.

## Inputs

- A guide selected by the CLI: `pnpm sdk-upgrade apply --example <name> --to <B>` (or `--app <path>`) prints the app dir, its installed version, and the chosen `migrations/<A>__<B>.json`.
- The app's source tree (e.g. `examples/<name>/src/`).

This skill ships two ways. **In the SDK repo**, the `pnpm sdk-upgrade` CLI does the selection and gating around you. **In an external partner app** (installed via `npx skills add` / the zama-ai/skills marketplace), there is no SDK CLI — see "Using this in an external app" below. The judgement steps are identical; only the surrounding plumbing differs.

## Hard rules

1. **Apply only what the guide lists.** You are **forbidden from re-deriving deltas** or inventing changes not in the guide. If you believe a change is missing, do **not** silently invent a fix — apply what is listed, let the typecheck gate surface the gap, and **report it** so the *guide* gets fixed (in the generate skill), not patched per-app. Per-app improvisation is exactly the drift this pipeline exists to kill.
2. **Idempotent.** The app's source may already be partly migrated (its pin can lag its code). For each change: if the old pattern is present, transform it; if it is already in the target form, skip. Never double-apply.
3. **`required` vs `recommended`.** Apply all `required` changes. Apply `recommended` ones when the pattern is present. A `required` change you cannot resolve is a **blocker** — list it explicitly in your summary.
4. **Do not bump pins or install here.** The deterministic gate does that (`--gate`). Your job is source edits only.
5. **Minimal diffs.** Change only what the guide's `action` requires. Don't reformat, don't rename unrelated things, don't add comments explaining the migration (the reviewer dislikes noise). Remove now-stale comments that the change invalidates.

## Procedure

1. Read the guide JSON. Note every `change` with its `detection`, `action`, `severity`, and `affectedSymbols`.
2. For each change, grep the app source for the `detection` pattern / `affectedSymbols`. Build the list of affected sites before editing.
3. Apply each `action` mechanically and idempotently across all sites. Work change-by-change so nothing is missed.
4. After all edits, tell the operator to run the gate:
   `pnpm sdk-upgrade apply --example <name> --to <B> --gate`
   which bumps the pins, installs, **formats** (oxfmt), then typechecks against B.
   Don't hand-match a sibling app's line-wrapping — the format step normalises
   incidental whitespace, so converging on *API usage* is enough; the gate makes
   the source byte-identical.
5. **If the gate's typecheck fails:** read each error. Two cases —
   - **A guide-listed change you missed at a site** → apply it (still within the guide). Re-run the gate.
   - **A delta the guide never mentions** → this is a guide gap. Do the minimal fix to get typecheck green **and** report it prominently so the generate skill can add it to the guide for the next app. Do not treat the per-app fix as sufficient.
6. Re-run the gate until typecheck exits 0.

## The deterministic gate is your safety net

The typecheck-against-B gate is what makes an LLM apply step trustworthy: it catches both *unapplied listed sites* and *deltas the guide missed*. Treat **green typecheck as the bar** for "done", and treat any guide gap it exposes as feedback that must flow back to the guide — not as a one-off local patch.

## Using this in an external app (no SDK CLI)

When this skill was installed via `npx skills add` / the zama-ai/skills marketplace, the guides travel with it under `guides/` (next to this `SKILL.md`), catalogued in `guides/index.json`. There is no `pnpm sdk-upgrade` — you run the plumbing yourself:

1. **Read the app's installed version** of `@zama-fhe/sdk` (and `@zama-fhe/react-sdk`) from its `package.json`.
2. **Select the guide** from `guides/index.json` using the same rule the CLI uses: among guides whose `to` equals the target version **B**, pick the one whose `from` is the **nearest published version ≤ the installed version**. A guide with an older `from` floor still applies — it is idempotent on a newer app. If none qualifies (the app predates every floor, or no guide targets B), **stop and report** that a guide must be generated SDK-side for this couple; do not improvise one.
3. **Apply** the selected guide exactly as in the Procedure above — same hard rules, same idempotency, still forbidden from re-deriving deltas.
4. **Gate with the app's own tooling**, not the SDK repo's: bump the `@zama-fhe/*` pins in `package.json` to B, install, run the app's own formatter, then its typecheck/build. Green typecheck is still the bar; any guide gap it exposes must be reported back so the SDK-side guide is fixed — never patched only locally.

Partners **apply** guides; they never **generate** them. Regeneration stays SDK-side so every consumer converges on the same reviewed artifact.

## You are done when

- every `required` change is applied or explicitly reported as an unresolved blocker, and
- `pnpm sdk-upgrade apply --example <name> --to <B> --gate` exits 0 (pins bumped, install clean, formatted, typecheck green), and
- your summary lists: changes applied, sites touched, any `recommended` changes skipped (with why), and any guide gaps the gate exposed.
