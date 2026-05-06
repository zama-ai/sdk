# Analyst Roles

Deep analysis produces three read-only JSON reports before implementation. Analysts must not edit files; Codex analyst runs should use the script's read-only analyst sandbox unless explicitly debugging the pipeline itself.

Required JSON shape:

- `schemaVersion: 1`
- `runId`
- `role`
- `summary`
- `findings[]`
- `manualChecks[]`
- `notes[]`

Each finding must include `id`, `severity`, `category`, `summary`, `evidence`, `affectedFiles`, `recommendedChange`, and `validation`. Markdown reports are generated from JSON and are not source-of-truth artifacts.

History analyst:

- Compare declared app SDK versions with resolved target versions.
- Read relevant changelog excerpts, API reports, and git history since the last relevant app/SDK update when discoverable.
- Identify breaking changes, behavior changes, and release-order risks.

Docs-pattern analyst:

- Read generated context docs and relevant official docs.
- Identify current high-level SDK and React SDK patterns the example should demonstrate.
- Flag places where local code reimplements documented hooks or utilities.

Source analyst:

- Inspect package exports, API reports, and SDK/react-sdk source for exact available primitives.
- Verify hook signatures against the package version declared by the example app.
- Flag risky low-level usage: direct relayer calls, placeholder addresses, manual cache invalidation, legacy APIs, and source-only unreleased APIs.
