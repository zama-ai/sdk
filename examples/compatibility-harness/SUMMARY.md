# Zama Compatibility Validation Harness — Technical Summary

## Purpose

This harness evaluates whether an integration system (wallet, MPC, custody API, smart-account stack) is compatible with the Zama SDK, with Sepolia as the default validated profile and a mainnet profile scaffold marked experimental.

The key objective is trustworthiness:
- avoid overclaiming compatibility,
- separate product incompatibility from infra failures,
- report exactly what was validated.

## Core Design

The internal model is adapter-based:
- primary export: `adapter` (preferred),
- legacy support: `signer` auto-wrapped for backward compatibility.

Adapter shape includes:
- metadata (name, declared architecture, verification model, chain support),
- capability declarations,
- operational primitives (`getAddress`, `signTypedData`, `signTransaction`, `writeContract`, optional reads/receipt tracking),
- optional async initialization.

## Capability and Status Models

Capabilities are tracked independently from outcomes:
- `addressResolution`
- `eip712Signing`
- `recoverableEcdsa`
- `rawTransactionSigning`
- `contractExecution`
- `contractReads`
- `transactionReceiptTracking`
- `zamaAuthorizationFlow`
- `zamaWriteFlow`

Capability state:
- `SUPPORTED`
- `UNSUPPORTED`
- `UNKNOWN`

Profile output separates:
- `declaredCapabilities`
- `observedCapabilities`
- `contradictions` when declared and observed states diverge.

Validation status:
- `PASS`
- `FAIL`
- `UNTESTED`
- `UNSUPPORTED`
- `BLOCKED`
- `INCONCLUSIVE`

This prevents false binary conclusions.

## Classification Model

Architectures:
- `EOA`
- `MPC`
- `SMART_ACCOUNT`
- `API_ROUTED_EXECUTION`
- `UNKNOWN`

Verification models:
- `RECOVERABLE_ECDSA`
- `ERC1271`
- `PROVIDER_MANAGED`
- `UNKNOWN`

Classification combines declared metadata and observed behavior. Contradictions degrade to `UNKNOWN`.

## Validation Surface (Current)

Test order:
1. Adapter profile (init + address resolution)
2. EIP-712 signing and recoverability
3. Optional ERC-1271 verification for declared smart-account/ERC-1271 integrations
4. Raw EOA transaction execution (if supported)
5. Contract read validation (adapter read when available, otherwise harness RPC fallback)
6. Zama authorization (`sdk.allow()`)
7. Zama write probe (operator approval write + on-chain verification)

## Reporting Model

The report is grouped into:
- Adapter Profile
- Ethereum Compatibility
- Adapter-Routed Execution
- Zama SDK Compatibility
- Infrastructure / Environment
- Final Verdict

Each failing or blocked item includes:
- reason,
- root-cause category,
- stable error code,
- recommendation.

The infrastructure/environment section is synthesized from observed root causes across all checks.

Root-cause categories:
- `ADAPTER`
- `SIGNER`
- `RPC`
- `RELAYER`
- `REGISTRY`
- `ENVIRONMENT`
- `HARNESS`

Error codes (current taxonomy):
- `ENV_MISSING_CONFIG`
- `ENV_INVALID_CONFIG`
- `ENV_INSUFFICIENT_FUNDS`
- `RPC_CONNECTIVITY`
- `RPC_RATE_LIMIT`
- `RELAYER_UNAVAILABLE`
- `REGISTRY_EMPTY`
- `REGISTRY_UNAVAILABLE`
- `HARNESS_UNKNOWN`

## Final Verdict Strategy

Verdicts are conservative and tied to validated Zama surface, for example:
- `ZAMA COMPATIBLE FOR AUTHORIZATION AND WRITE FLOWS`
- `ZAMA COMPATIBLE FOR AUTHORIZATION FLOWS — WRITE FLOW NOT TESTED`
- `PARTIALLY VALIDATED — AUTHORIZATION COMPATIBLE, WRITE FLOW UNSUPPORTED`
- `PARTIALLY VALIDATED — AUTHORIZATION PASSED, RECOVERABILITY NOT CONFIRMED`
- `INCOMPATIBLE — ZAMA AUTHORIZATION FLOW FAILED`
- `INCONCLUSIVE — AUTHORIZATION FLOW BLOCKED BY ENVIRONMENT OR INFRASTRUCTURE`

No generic “COMPATIBLE” claim is emitted without scope.

## Infrastructure Handling

Infrastructure and environment failures are explicitly separated from adapter incompatibility:
- configuration defects (`.env`, missing keys) -> `BLOCKED / ENVIRONMENT`
- RPC/network issues -> `INCONCLUSIVE / RPC`
- relayer availability/errors -> `INCONCLUSIVE / RELAYER`
- token registry discovery issues -> `BLOCKED / REGISTRY`

This reduces false negatives for integrators.

## Integrator Experience

Current workflow remains lightweight:
1. clone,
2. set `.env`,
3. (optional) run `npm run doctor` for preflight diagnostics,
4. provide adapter (or scaffold one via `npm run init:adapter`),
5. run tests,
6. read structured report and scoped verdict.

For deterministic local runs without RPC/relayer dependencies, set `HARNESS_MOCK_MODE=1`; network-dependent checks are recorded as `UNTESTED` instead of being conflated with compatibility failures.

For CI and automated go/no-go checks, `npm run validate` executes the suite, reads the JSON artifact claim, and returns policy-oriented exit codes. Gate target is configurable via `VALIDATION_TARGET` (`AUTHORIZATION` or `AUTHORIZATION_AND_WRITE`).

`validate` also supports JSON policy files (`VALIDATION_POLICY_PATH`) for explicit claim allow-lists and partial-acceptance behavior, while enforcing the report schema contract before decisioning.

Reference examples currently included:
- Crossmint API-routed adapter
- Turnkey API key adapter
- Openfort EOA baseline adapter (CLI compatibility baseline for EOA semantics)

## Report Artifact

An optional machine-readable report can be exported with:
- `REPORT_JSON_PATH=./reports/latest.json npm test`

Versioned schema contract:
- `kind`: `zama-compatibility-report`
- `schemaVersion`: `1.2.0`
- payload includes profile, recorded checks, synthesized environment summary, section views, blockers, claim metadata (`evidence` + optional `evidenceDetails`), verdict, and run id.

## Scope Limits

The harness is still a practical diagnostic tool, not a production certification authority.

Out of scope today:
- deterministic guarantees for all non-Sepolia environments (mainnet profile is currently marked experimental),
- exhaustive Zama write/read behavior coverage,
- full ERC-1271 validation matrix,
- full certification-level CI policy automation.
