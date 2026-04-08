# Schema and Release Discipline

This document defines how to evolve harness artifacts without breaking consumers unexpectedly.

## 1) `schemaVersion` Bump Policy

Current artifact version is controlled by `REPORT_SCHEMA_VERSION` in `src/report/schema.ts`.

Use semantic intent:

- Patch (`x.y.Z`):
  - no artifact shape change,
  - wording/doc-only updates,
  - parser behavior unchanged for valid artifacts.

- Minor (`x.Y.z`):
  - backward-compatible additive changes,
  - new optional fields only,
  - existing required fields and semantics preserved.

- Major (`X.y.z`):
  - any breaking contract change,
  - required field changes/removals/renames,
  - semantic reinterpretation that can break existing consumers.

## 2) Required Changes for Schema-Affecting PRs

When artifact schema changes:

1. Update `REPORT_SCHEMA_VERSION` in `src/report/schema.ts`.
2. Update parser contract checks in `src/report/parse.ts`.
3. Update claim/report consistency guards if needed.
4. Update fixtures:
   - current schema fixtures,
   - legacy/unsupported schema fixture,
   - malformed fixtures.
5. Update docs:
   - `README.md`,
   - `SUMMARY.md`,
   - `docs/report-consumption.md`,
   - `docs/claim-catalog.md` (if claim semantics changed).
6. Run verification:
   - `npm run typecheck`,
   - `npm test`,
   - `HARNESS_MOCK_MODE=1 npm run validate`.

## 3) Harness Release Checklist

Before tagging/releasing:

1. Deterministic CI green (`compatibility-harness-ci.yml`).
2. Artifact compatibility tests green (`artifactCompatibility.unit.test.ts`).
3. Claim consistency tests green (`claimConsistency.unit.test.ts`).
4. Example baseline lockfile tests green (`exampleBaselines.unit.test.ts`).
5. Docs updated for any new claims/status semantics.
6. Optional: run live workflow and store uploaded artifacts.

## 4) Release Note Template

Use this template in release notes/PR description:

```md
## Compatibility Harness Release

### Schema
- schemaVersion: <old> -> <new>
- Change type: Patch / Minor / Major
- Consumer impact: <none | additive | breaking>

### Claim/Verdict Semantics
- Changed claim IDs: <none | list>
- Gate mapping impact: <none | describe>

### Validation Surface
- New checks/capabilities: <list>
- Deprecated checks/capabilities: <list>

### Migration Guidance
- Required consumer actions:
  - <action 1>
  - <action 2>
```
