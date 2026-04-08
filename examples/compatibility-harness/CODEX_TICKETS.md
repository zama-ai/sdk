# Compatibility Harness — Codex Tickets

This file is the execution backlog for Codex-style implementation (small, reviewable commits with explicit acceptance checks).

## Conventions

- Branch strategy: feature branch, one ticket per commit whenever practical.
- Verification baseline per ticket:
  - `npm run typecheck`
  - `npm test`
- Keep integrator UX simple:
  - clone
  - configure `.env`
  - choose adapter
  - run command (`doctor`, `test`, or `validate`)

## Completed

### T6 — Infrastructure Error Taxonomy

Status: `DONE`

Objective:
- Add stable error-code taxonomy for infra/environment failures.
- Propagate error codes into recorded checks and report output.

Implementation notes:
- Extend diagnostics classification with `errorCode`.
- Include `errorCode` in report schema and console output.
- Update tests that record `BLOCKED`/`INCONCLUSIVE` diagnostics.

Acceptance:
- Report shows `Error code` on relevant checks.
- Unit tests cover code classification branches.

Commit:
- `8752f4ef` (`feat(diagnostics): add infrastructure error-code taxonomy`)

### T7 — Doctor Preflight CLI

Status: `DONE`

Objective:
- Add fast preflight diagnostics command before full harness run.

Implementation notes:
- Add `src/cli/doctor.ts`.
- Add `npm run doctor`.
- Document checks and exit codes in README/SUMMARY.

Acceptance:
- `npm run doctor` executes and returns:
  - `0` (all pass), `2` (blocked), `3` (inconclusive), `99` (unexpected).

Commit:
- `640daac6` (`feat(cli): add doctor preflight command and docs`)

### T8 — Claim-Based Validation Gate CLI

Status: `DONE`

Objective:
- Add CI-friendly command with stable exit codes based on final claim.

Implementation notes:
- Add `src/cli/validate-policy.ts` (claim -> gate decision).
- Add `src/cli/validate.ts` (run harness + parse JSON artifact + apply gate policy).
- Add `npm run validate`.
- Add unit tests for policy logic.
- Document `VALIDATION_TARGET` and exit codes.

Acceptance:
- `npm run validate` exits with:
  - `0` pass
  - `10` partial
  - `20` incompatible
  - `30/31` inconclusive
  - `97/98/99` runtime/config classes
- Policy behavior covered by unit tests.

Commit:
- `d7a55e91` (`feat(cli): add claim-based validate gate for CI`)

## Next Priority

### T12 — Deterministic Offline Harness Mode

Status: `DONE`

Objective:
- Add deterministic local mode to prevent infra noise from polluting compatibility checks.

Codex spec:
1. Add runtime flag `HARNESS_MOCK_MODE`.
2. For network/relayer/registry-dependent checks, record `UNTESTED` with explicit rationale when enabled.
3. Document mode in `.env.example`, README, and summary docs.
4. Add unit tests for runtime flag parsing behavior.

Acceptance:
- `HARNESS_MOCK_MODE=1 npm test` marks dependent checks as `UNTESTED`.
- Standard mode behavior remains unchanged.
- Typecheck and tests pass.

Commit:
- pending (current working tree)

### T9 — Turnkey Golden Scenario Fixture

Status: `DONE`

Objective:
- Add deterministic Turnkey fixture docs and expected report profile for regression checks.

Codex spec:
1. Add `examples/turnkey/COMPATIBILITY.md` section with:
   - expected capability profile,
   - expected claim range (pass/partial/inconclusive depending env),
   - known blockers and error codes.
2. Add script alias for turnkey validation gate:
   - `validate:turnkey`
3. Add minimal smoke command section in README.

Acceptance:
- Turnkey docs clearly separate adapter incompatibility from infra blockers.
- `npm run validate:turnkey` works with standard env vars.

Commit:
- pending (current working tree)

### T10 — Openfort Adapter Parity

Status: `DONE`

Objective:
- Bring Openfort example up to same quality level as Turnkey/Crossmint examples.

Codex spec:
1. Validate `examples/openfort/signer.ts` metadata/capability declaration quality.
2. Add or refresh `examples/openfort/COMPATIBILITY.md`:
   - explicit scope (EOA semantics baseline),
   - what is not validated (embedded/session UX),
   - expected verdict categories.
3. Add script alias:
   - `validate:openfort`

Acceptance:
- Openfort example can be run with one command from README.
- Documentation is explicit on proof boundaries.

Commit:
- pending (current working tree)

### T13 — Golden Report Regression Fixtures

Status: `DONE`

Objective:
- Freeze representative report artifacts to catch parser/policy regressions.

Codex spec:
1. Add parseable golden report fixtures (full compatibility + infra-blocked scenario).
2. Add unit tests validating:
   - artifact schema parsing,
   - claim-to-gate mapping behavior.
3. Add strict runtime artifact parsing in `validate` CLI.

Acceptance:
- Golden fixture tests pass.
- `validate` rejects malformed or schema-incompatible artifacts with explicit errors.

Commit:
- pending (current working tree)

### T11 — Report Consumer Guide

Status: `DONE`

Objective:
- Improve machine-consumer usability of report artifacts.

Codex spec:
1. Add `docs/report-consumption.md` with:
   - schema fields needed for CI gates,
   - claim/evidence interpretation rules,
   - backward compatibility guidance for `schemaVersion`.
2. Provide copy-paste examples for:
   - auth-only gate,
   - strict auth+write gate.

Acceptance:
- A partner engineer can build a parser without reading source code.

Commit:
- pending (current working tree)

### T14 — Validate Policy File Support

Status: `DONE`

Objective:
- Make validation gating configurable without code changes.

Codex spec:
1. Add `VALIDATION_POLICY_PATH` JSON policy support.
2. Support claim allow-list and partial acceptance controls.
3. Keep env overrides explicit (`VALIDATION_TARGET`, `VALIDATION_ALLOW_PARTIAL`).
4. Add unit tests for config parsing and policy application.

Acceptance:
- `validate` can read policy files and enforce expected claim IDs.
- `validate` can optionally accept partial outcomes via policy/env.
- Invalid policies fail with explicit config errors.

Commit:
- pending (current working tree)

### T15 — Adapter Template Bootstrap Command

Status: `DONE`

Objective:
- Reduce setup friction for new integrators creating a custom adapter module.

Codex spec:
1. Add `npm run init:adapter` CLI to scaffold a typed adapter template.
2. Support custom output paths.
3. Infer correct relative `Adapter` type import path for nested outputs.
4. Add unit tests for template path resolution/rendering.

Acceptance:
- Running `npm run init:adapter` creates a compilable starter adapter file.
- Custom path generation works without manual import fixes.
- Unit tests pass.

Commit:
- pending (current working tree)

### T16 — Optional ERC-1271 Verification Probe

Status: `DONE`

Objective:
- Improve smart-account diagnostics by probing ERC-1271 when declared by adapter metadata.

Codex spec:
1. Add optional `ERC-1271 Verification` check in identity/verification stage.
2. Trigger when adapter declares `SMART_ACCOUNT` architecture or `ERC1271` verification model.
3. Record pass/fail/blocked outcomes with infra-aware diagnostics.
4. Keep recoverability failure semantics unchanged for Zama auth claims.

Acceptance:
- Harness reports explicit ERC-1271 check outcomes when applicable.
- Smart-account diagnostics improve without overclaiming Zama authorization compatibility.

Commit:
- pending (current working tree)

### T17 — Network Profile Scaffolding

Status: `DONE`

Objective:
- Move from hardcoded Sepolia assumptions to explicit profile-based network configuration.

Codex spec:
1. Introduce `NETWORK_PROFILE` (`sepolia`, `mainnet`) with typed parsing/building.
2. Keep Sepolia defaults backward compatible.
3. Require explicit `RELAYER_URL` on mainnet profile.
4. Surface profile/support metadata in diagnostics (`doctor`).
5. Add unit tests for profile/config parsing and validation.

Acceptance:
- Default behavior remains unchanged on Sepolia.
- Misconfigured mainnet profile fails fast with actionable error.
- Network profile selection is documented in README and `.env.example`.

Commit:
- pending (current working tree)

## Definition of Done (Project-Level)

- Adapter model remains capability-first and conservative.
- Verdicts are scoped and claim-based (no overclaiming).
- Infra/environment blockers are separated from compatibility failures.
- Built-in examples (Crossmint, Turnkey, Openfort) are runnable and documented.
- README remains <10-minute onboarding for new integrators.
