# Claim Catalog

This catalog defines stable claim semantics emitted by the harness (`claim.id`).

Use this as the contract for:
- CI policy gating (`npm run validate`, `VALIDATION_POLICY_PATH`),
- partner discussions about what is validated,
- downstream report consumers.

## Claim IDs

| Claim ID | Trigger (high level) | Confidence Scope | Gate (`AUTHORIZATION`) | Gate (`AUTHORIZATION_AND_WRITE`) |
|---|---|---|---|---|
| `ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE` | auth=PASS, recoverability=PASS, write=PASS | Strong harness evidence for auth+write probe scope | PASS | PASS |
| `ZAMA_AUTHORIZATION_COMPATIBLE_WRITE_NOT_RECORDED` | auth=PASS, recoverability=PASS, write=MISSING | Auth-compatible only; write not validated | PASS | PARTIAL |
| `PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNSUPPORTED` | auth=PASS, recoverability=PASS, write=UNSUPPORTED | Auth-compatible only; adapter write surface missing | PASS | PARTIAL |
| `PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNTESTED` | auth=PASS, recoverability=PASS, write=UNTESTED | Auth-compatible only; write intentionally skipped | PASS | PARTIAL |
| `PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_BLOCKED` | auth=PASS, recoverability=PASS, write=BLOCKED/INCONCLUSIVE | Auth-compatible only; write blocked by infra/env | PASS | PARTIAL |
| `PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_FAILED` | auth=PASS, recoverability=PASS, write=FAIL | Auth-compatible only; write probe failed | PASS | PARTIAL |
| `PARTIAL_AUTHORIZATION_RECOVERABILITY_UNCONFIRMED` | auth=PASS, recoverability not confirmed (`MISSING/UNTESTED/UNSUPPORTED/BLOCKED/INCONCLUSIVE`) | Inconclusive for auth compatibility confidence | INCONCLUSIVE | INCONCLUSIVE |
| `PARTIAL_AUTHORIZATION_CHECK_MISSING` | auth check missing | Inconclusive baseline | INCONCLUSIVE | INCONCLUSIVE |
| `INCONCLUSIVE_AUTHORIZATION_BLOCKED` | auth=BLOCKED/INCONCLUSIVE | Inconclusive (infra/env blocker) | INCONCLUSIVE | INCONCLUSIVE |
| `INCONCLUSIVE_AUTHORIZATION_UNTESTED` | auth=UNTESTED | Inconclusive (not executed) | INCONCLUSIVE | INCONCLUSIVE |
| `INCOMPATIBLE_AUTHORIZATION_FAILED` | auth=FAIL | Incompatible for authorization surface | FAIL | FAIL |
| `INCOMPATIBLE_AUTHORIZATION_UNSUPPORTED` | auth=UNSUPPORTED | Incompatible for authorization surface | FAIL | FAIL |
| `INCOMPATIBLE_AUTHORIZATION_RECOVERABILITY` | auth=PASS, recoverability=FAIL | Incompatible for required recoverability model | FAIL | FAIL |

## Trigger Source of Truth

The canonical trigger logic lives in:
- `src/verdict/claims.ts` (claim rule definitions),
- `src/verdict/resolve.ts` (claim resolution),
- `src/verdict/consistency.ts` (claim/evidence consistency guard).

## Policy File Examples

### Strict full compatibility only

```json
{
  "target": "AUTHORIZATION_AND_WRITE",
  "allowPartial": false,
  "expectedClaims": ["ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE"]
}
```

### Authorization-compatible envelope (write may be partial)

```json
{
  "target": "AUTHORIZATION",
  "allowPartial": false,
  "expectedClaims": [
    "ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE",
    "ZAMA_AUTHORIZATION_COMPATIBLE_WRITE_NOT_RECORDED",
    "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNSUPPORTED",
    "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNTESTED",
    "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_BLOCKED",
    "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_FAILED"
  ]
}
```

### Temporary acceptance of partial strict outcomes

```json
{
  "target": "AUTHORIZATION_AND_WRITE",
  "allowPartial": true,
  "expectedClaims": []
}
```
