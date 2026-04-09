# Report Consumption Guide

This guide explains how to consume the compatibility harness JSON artifact in CI and partner tooling.

## 1) Contract Checks (Mandatory)

Before reading business fields, verify:

- `kind === "zama-compatibility-report"`
- `schemaVersion` is one of: `1.2.0`, `1.3.0`

If either check fails, treat the artifact as incompatible with your parser.

## 2) Primary Decision Fields

Use these top-level fields as canonical outputs:

- `claim.id`
- `claim.verdictLabel`
- `claim.confidence`
- `finalVerdict`
- optional `zama.writeValidationDepth`
- optional `claim.evidenceDetails` (structured per-check evidence records)

`finalVerdict` is human-facing; `claim.id` is the stable machine-facing key for CI policy.

## 3) Infrastructure vs Compatibility

To separate infra blockers from compatibility defects:

- inspect `checks.recorded[*].status`
- inspect `checks.recorded[*].checkId` (canonical machine key)
- inspect `checks.recorded[*].rootCauseCategory`
- inspect `checks.recorded[*].errorCode`
- inspect `zama.writeValidationDepth`
- inspect `infrastructure.blockers`

Rule of thumb:

- `BLOCKED`/`INCONCLUSIVE` with `RPC`/`RELAYER`/`REGISTRY`/`ENVIRONMENT` indicates infra or setup constraints.
- `FAIL` with `SIGNER`/`ADAPTER` is usually a true compatibility issue.

## 4) CI Patterns

### Pattern A: Harness-managed gate (recommended)

Use:

```bash
npm run validate
```

or strict scope:

```bash
VALIDATION_TARGET=AUTHORIZATION_AND_WRITE npm run validate
```

or policy file:

```bash
VALIDATION_POLICY_PATH=./validation-policy.example.json npm run validate
```

### Pattern B: External gate from artifact

If you need custom pipelines, parse `claim.id` yourself:

```bash
jq -r '.claim.id' reports/latest.json
```

Example strict allow-list:

```bash
CLAIM="$(jq -r '.claim.id' reports/latest.json)"
case "$CLAIM" in
  ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE) exit 0 ;;
  PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNSUPPORTED|PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNTESTED) exit 10 ;;
  INCOMPATIBLE_*) exit 20 ;;
  INCONCLUSIVE_*|PARTIAL_AUTHORIZATION_CHECK_MISSING) exit 30 ;;
  *) exit 31 ;;
esac
```

## 5) Backward Compatibility Guidance

- Treat `schemaVersion` as the compatibility boundary.
- Treat fields introduced in later versions as optional when parsing older artifacts.
- Do not parse undocumented internal fields for gating.
- Prefer `claim.id` + `validate` exit codes over ad hoc string matching on report text.

## 6) Suggested Artifact Retention

Store at least:

- full report JSON,
- CI logs,
- adapter metadata (`adapterProfile`),
- command context (adapter module path, network config, policy file used).
