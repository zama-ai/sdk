# Analyst Roles

Deep analysis produces three read-only reports before implementation. Analysts must not edit files.

Required report headings:

- `# Summary`
- `# Relevant Findings`
- `# Impact On Target Example`
- `# Required Changes`
- `# Risks`
- `# Validation Suggestions`

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
