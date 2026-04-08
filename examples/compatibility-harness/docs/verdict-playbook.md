# Verdict Interpretation Playbook

This playbook helps engineers and partner-facing teams interpret harness outcomes conservatively.

Use this sequence:
1. Read `claim.id` (machine key).
2. Confirm `claim.evidence` / `claim.evidenceDetails`.
3. State only what is proven by the recorded checks.
4. Explicitly call out untested/blocked surfaces and next action.

## Claim Interpretation Matrix

### `ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE`
- Proven: authorization flow, recoverability, and write probe passed.
- Not proven: full production readiness or all SDK paths.
- Next action: proceed to partner pilot integration; keep monitor checks in CI.

### `ZAMA_AUTHORIZATION_COMPATIBLE_WRITE_NOT_RECORDED`
- Proven: authorization + recoverability passed.
- Not proven: write-path compatibility.
- Next action: run write validation in an environment where write checks can execute.

### `PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNSUPPORTED`
- Proven: authorization + recoverability passed.
- Not proven: adapter write surface compatibility.
- Next action: validate if write can be routed through another execution path or explicitly scope to auth-only integration.

### `PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNTESTED`
- Proven: authorization + recoverability passed.
- Not proven: write surface (intentionally not tested).
- Next action: rerun without mock/skip constraints.

### `PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_BLOCKED`
- Proven: authorization + recoverability passed.
- Not proven: write surface because infra/env blocked validation.
- Next action: resolve blocker root cause (`errorCode`) and rerun write validation.

### `PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_FAILED`
- Proven: authorization + recoverability passed.
- Not proven: write compatibility (write probe failed).
- Next action: debug adapter execution path and rerun.

### `PARTIAL_AUTHORIZATION_RECOVERABILITY_UNCONFIRMED`
- Proven: authorization check passed.
- Not proven: EOA-style recoverability requirement.
- Next action: verify recoverability behavior or adjust integration model expectations.

### `PARTIAL_AUTHORIZATION_CHECK_MISSING`
- Proven: nothing about authorization compatibility.
- Not proven: authorization baseline itself.
- Next action: ensure authorization check is executed and recorded.

### `INCONCLUSIVE_AUTHORIZATION_BLOCKED`
- Proven: no incompatibility conclusion yet.
- Not proven: authorization compatibility (blocked by infra/env).
- Next action: resolve blockers (env, RPC, relayer, registry) and rerun.

### `INCONCLUSIVE_AUTHORIZATION_UNTESTED`
- Proven: no incompatibility conclusion yet.
- Not proven: authorization compatibility (check skipped/untested).
- Next action: execute full authorization validation run.

### `INCOMPATIBLE_AUTHORIZATION_FAILED`
- Proven: authorization flow is incompatible in current adapter behavior.
- Not proven: compatibility after adapter fixes.
- Next action: fix signing/identity behavior and rerun from `doctor` + `validate`.

### `INCOMPATIBLE_AUTHORIZATION_UNSUPPORTED`
- Proven: adapter does not expose required authorization primitive.
- Not proven: compatibility through alternate execution design.
- Next action: add/route EIP-712 authorization support or scope integration away from unsupported surface.

### `INCOMPATIBLE_AUTHORIZATION_RECOVERABILITY`
- Proven: recoverability requirement failed.
- Not proven: compatibility as EOA-style authorization signer.
- Next action: either fix recoverability or explicitly adopt a different model and document limitations.

## Partner Conversation Patterns

### Pattern A: Full-compatible outcome
- "We validated authorization and write probes in the harness scope (`ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE`)."
- "This confirms harness-level compatibility, not full production certification."

### Pattern B: Auth-only compatible outcome
- "Authorization is validated, but write compatibility is still partial/not recorded."
- "Integration can proceed for auth-scoped flows while we close write-surface validation."

### Pattern C: Inconclusive outcome
- "The run is inconclusive due to infrastructure blockers, not confirmed incompatibility."
- "We need a clean rerun after resolving `<errorCode>` before making compatibility claims."
