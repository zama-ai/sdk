# Zama Compatibility Validation Harness — Summary V2

## 1) Why This Project Exists

Integrators regularly ask a simple question:

> Is our wallet / custody / execution stack compatible with the Zama SDK?

In practice, this is hard to answer with a single binary test because integration systems are heterogeneous:

- EOA wallets,
- MPC-backed signers,
- API-routed custody stacks,
- smart-account and ERC-1271 systems.

A system can fail one Ethereum primitive (for example raw transaction signing) while still being usable for relevant Zama flows.  
This harness exists to produce **conservative, evidence-based compatibility claims** instead of assumptions.

## 2) What Was Built

The harness is now adapter-based and capability-driven (not signer-only).

Core product characteristics:

- adapter metadata + capabilities model,
- runtime observation model (declared vs structural vs runtime vs final capability view),
- canonical check registry and deterministic check IDs,
- multi-status outcome model:
  - `PASS`
  - `FAIL`
  - `UNTESTED`
  - `UNSUPPORTED`
  - `BLOCKED`
  - `INCONCLUSIVE`
- scoped claim system (no generic unsafe "compatible" statements),
- deterministic confidence level per final claim (`HIGH`, `MEDIUM`, `LOW`),
- explicit Zama write validation depth (`FULL`, `PARTIAL`, `UNTESTED`),
- infrastructure-aware diagnostics (`errorCode`, root-cause category, recommendation),
- CI-oriented validation gate command (`npm run validate`).

## 3) Validation Surfaces (What Is Actually Tested)

The harness validates, depending on adapter support:

1. Adapter bootstrapping and address resolution.
2. EIP-712 signing and recoverability checks.
3. Optional ERC-1271 probe for smart-account declared profiles.
4. Raw transaction execution (when exposed by adapter).
5. Adapter-routed execution/read surface (with fallback read strategy when applicable).
6. Zama authorization flow.
7. Practical Zama write probe with submission/receipt/state verification signals.

Synthetic infrastructure checks are also produced from observed failures:

- environment configuration,
- RPC connectivity,
- relayer reachability,
- registry/token discovery.

This prevents infra outages from being mislabeled as signer incompatibility.

## 4) Integrator Workflow (Current UX)

The intended external workflow remains short and operational:

1. Clone repository and configure `.env`.
2. Generate or provide adapter.
3. Run local quality and preflight checks.
4. Run full compatibility suite.
5. Use final claim + confidence + write-depth to make a decision.

Typical command sequence:

```bash
npm run init:adapter -- --template eoa --output ./examples/my-provider/signer.ts
SIGNER_MODULE=./examples/my-provider/signer.ts npm run adapter:check
SIGNER_MODULE=./examples/my-provider/signer.ts npm run doctor
SIGNER_MODULE=./examples/my-provider/signer.ts npm test
SIGNER_MODULE=./examples/my-provider/signer.ts npm run validate
```

Available scaffold templates now include:

- `generic`
- `eoa`
- `mpc`
- `api-routed`
- `turnkey`
- `crossmint`
- `openfort`

Provider presets are intentional starter scaffolds based on examples in this repository; they are not production certification by themselves.

## 5) Command Surface for Real Examples

The repository now exposes aligned command paths for real demo adapters:

- Crossmint:
  - `npm run test:crossmint`
  - `npm run doctor:crossmint`
  - `npm run validate:crossmint`
- Turnkey:
  - `npm run test:turnkey`
  - `npm run doctor:turnkey`
  - `npm run validate:turnkey`
- Openfort:
  - `npm run test:openfort`
  - `npm run doctor:openfort`
  - `npm run validate:openfort`

This gives comparable operational workflows across reference integrations.

## 6) Report Contract and Machine Consumption

Artifact contract is now schema `1.3.0` (parser accepts `1.2.0` and `1.3.0`).

Key machine fields:

- `claim.id`
- `claim.verdictLabel`
- `claim.confidence`
- `zama.writeValidationDepth`
- `checks.recorded[*].checkId`
- `checks.recorded[*].status`
- `checks.recorded[*].rootCauseCategory`
- `checks.recorded[*].errorCode`

This enables stable CI gating and partner diagnostics while preserving backward parse support during transition.

## 7) Practical Example (Turnkey)

A healthy Turnkey run typically yields:

- `EIP-712 Signing`: `PASS`
- `EIP-712 Recoverability`: `PASS` (when observed signatures are recoverable)
- `Raw Transaction Execution`: usually `UNSUPPORTED` by declared adapter model
- `Zama Authorization Flow`: `PASS`
- `Zama Write Flow`: `PASS` (if relayer/RPC/registry/environment are healthy)

Potential final outcome:

- `Final: ZAMA COMPATIBLE FOR AUTHORIZATION AND WRITE FLOWS`
- `Write Validation Depth: FULL`
- `Confidence: HIGH`

If infra is degraded, final status should move to `BLOCKED`/`INCONCLUSIVE` classes rather than incorrectly marking adapter incompatibility.

## 8) What This Harness Can and Cannot Claim

What it can claim with good confidence:

- scoped compatibility for explicitly validated Zama surfaces,
- evidence-backed incompatibility for observed signer/adapter failures,
- infra vs compatibility separation for triage.

What it does not claim:

- universal, permanent compatibility certification,
- exhaustive coverage of all SDK and network/runtime edge cases,
- frontend UX correctness for embedded auth/session stacks.

## 9) Next Iteration Options

Most useful next product increments:

1. Expand archetype-specific policy presets for `validate` (EOA, API-routed custody, smart-account profiles).
2. Add stricter live-run governance and artifact retention conventions for partner pilot programs.
3. Increase coverage depth for smart-account specific paths (broader ERC-1271/AA scenario matrix).
4. Add stronger adapter contract tests for generated templates to keep scaffolds aligned with production examples.

## 10) Conclusion

The harness is now a serious compatibility diagnostics tool, not a basic test script collection.

It provides:

- conservative, claim-based compatibility outputs,
- explicit confidence and write-depth semantics,
- better DX for external integrators (scaffold + doctor + validate),
- machine-consumable artifacts suitable for CI and partner-facing technical reviews.

Current state is suitable for controlled partner pilots and internal technical review cycles, with clear boundaries on what remains outside certification scope.
