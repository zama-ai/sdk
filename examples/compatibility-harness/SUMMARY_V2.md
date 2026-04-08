# Zama Compatibility Validation Harness — Summary V2

## 1) Executive Summary

The Compatibility Validation Harness has evolved from a narrow proof-of-concept into a **capability-first diagnostic product prototype**.

At this stage, it is best classified as:

- **Partner-pilot ready** (for guided external integrations),
- **Not yet GA-certified** (for broad self-serve external rollout without support).

The harness now provides conservative, evidence-backed answers to:

1. What integration architecture is this adapter?
2. Which capabilities are declared and observed?
3. Which compatibility surfaces were actually validated?
4. What is proven vs not proven?
5. Which failures are compatibility issues vs infrastructure blockers?

Core outcome: the project can now support credible internal and partner-facing compatibility discussions without overclaiming.

### Verification Basis for This Document

This summary is grounded in the implementation currently present in this repository branch.
Key source-of-truth files used to verify claims:

- `src/report/check-registry.ts` (canonical check model),
- `src/report/schema.ts`, `src/report/parse.ts`, `src/report/reporter.ts` (artifact/report contract),
- `src/verdict/claims.ts`, `src/verdict/resolve.ts`, `src/verdict/consistency.ts` (claim semantics + consistency guards),
- `src/harness/negative-paths.ts` (negative-path classification model),
- `src/harness/recommendations.ts` (deterministic recommendation mapping),
- `src/cli/adapter-check-core.ts`, `src/cli/adapter-check.ts` (adapter quality gate),
- `.github/workflows/compatibility-harness-ci.yml`, `.github/workflows/compatibility-harness-live.yml` (CI/live workflows),
- `examples/{crossmint,turnkey,openfort}` and baseline fixtures in `src/tests/fixtures/example-baselines`.

Validation state at review time:

- `npm run typecheck` passed,
- `npm test` passed,
- `npm run adapter:check` passed.

## 2) Product Goal and Scope (Current Stage)

### Product Goal

Provide a practical, repeatable way for wallet/custody/infrastructure teams to validate compatibility with:

- Ethereum signing model expectations,
- EIP-712 recoverability semantics,
- Zama SDK authorization and practical write-path probes.

### Intended Audience

- Zama SDK engineers,
- Partner solution engineers,
- External integrator engineering teams (wallet providers, custody APIs, MPC platforms).

### Current Stage Target

This stage targets **fast and trustworthy partner pilot validation**, not final certification authority.

## 3) Why This Product Exists

Real integrations are heterogeneous:

- EOA wallets,
- API-routed custody,
- MPC systems,
- smart-account patterns.

A signer-only model produced false negatives and misleading conclusions.  
The harness now models compatibility using:

- explicit adapter capabilities,
- structured statuses beyond pass/fail,
- scoped claims tied to observed evidence.

## 4) What Was Implemented

### 4.1 Architecture and Validation Engine

- Replaced implicit assumptions with a canonical check model:
  - check IDs,
  - section ownership,
  - dependency ordering.
- Enforced canonical checks in recording and parsing paths.
- Added deterministic negative-path classification coverage for:
  - EIP-712 signing failure,
  - recoverability failure,
  - authorization rejection,
  - write submission failure.
- Added strict claim/status consistency guards:
  - report build fails on inconsistent claim evidence,
  - artifact parsing rejects inconsistent claims.

### 4.2 Reporting Contract and Evidence Quality

- Artifact contract hardened (`schemaVersion: 1.2.0`).
- Each check now carries canonical `checkId`.
- Claim payload now supports:
  - `claim.evidence` (stable map),
  - `claim.evidenceDetails` (structured check-level records: check ID, status, reason category).
- Added malformed and legacy artifact fixtures to prevent silent schema drift.

### 4.3 Diagnostics and Recommendations

- Centralized recommendation mapping by `errorCode`.
- `BLOCKED`/`INCONCLUSIVE` checks now get deterministic, action-oriented recommendations with next-command hints.
- Infrastructure causes are kept separate from compatibility causes (adapter/signer).

### 4.4 Integrator Confidence Tooling

- Added `npm run adapter:check`:
  - validates adapter metadata completeness,
  - validates capability shape and dependency consistency,
  - flags declared vs observed contradictions,
  - previews canonical check support.
- Added example baseline lockfiles (Crossmint, Turnkey, Openfort) with regression guards:
  - expected adapter metadata and declared capabilities,
  - claim envelope bounds for PASS/PARTIAL/INCONCLUSIVE categories.

### 4.5 CI and Operations

- Deterministic mandatory CI remains the baseline (`HARNESS_MOCK_MODE=1`).
- Added optional live workflow (manual/nightly), non-blocking by default:
  - runs live validation,
  - captures exit code,
  - uploads JSON/log artifacts for post-mortem review.

### 4.6 Documentation Pack for Internal/Partner Review

- Claim catalog (stable semantics and gate mapping),
- Verdict interpretation playbook,
- Schema/release discipline policy.

This improves consistency across engineering, solutions, and CI consumers.

## 5) How the System Works

### 5.1 Adapter-Centric Model

An integration is represented as an `adapter` with:

- metadata (name, declared architecture, verification model, supported chains),
- capabilities (`SUPPORTED` / `UNSUPPORTED` / `UNKNOWN`),
- operational primitives (`getAddress`, `signTypedData`, optional execution/read/receipt methods),
- optional async initialization.

### 5.2 Validation Pipeline

Execution flow:

1. Adapter profile and initialization checks.
2. Identity and verification checks (EIP-712, recoverability, optional ERC-1271 probe).
3. Ethereum execution checks (raw tx when supported).
4. Adapter-routed execution checks (contract reads/writes where available).
5. Zama checks:
   - authorization flow (`sdk.allow()`),
   - practical write probe + on-chain verification.
6. Infrastructure summary synthesis.
7. Claim resolution from canonical evidence.

### 5.3 Status and Verdict Semantics

Status model:

- `PASS`, `FAIL`, `UNTESTED`, `UNSUPPORTED`, `BLOCKED`, `INCONCLUSIVE`.

Final verdict is claim-based and scoped.  
No generic “compatible” output is emitted without precise evidence.

### 5.4 Machine-Consumable Output

Optional JSON artifact includes:

- adapter profile,
- canonical check records,
- section views,
- infrastructure blockers,
- claim (`id`, rationale, evidence, optional evidenceDetails),
- human final verdict.

## 6) Concrete Example (Turnkey)

### 6.1 Adapter Characteristics

Turnkey example declares:

- architecture: `API_ROUTED_EXECUTION`,
- EIP-712 signing: supported,
- raw transaction signing: unsupported,
- contract execution/read/receipt support: available via Turnkey APIs/clients.

### 6.2 Expected Interpretation Pattern

A healthy run can still be **fully compatible** even with raw tx unsupported, because:

- raw EOA-style tx signing is not required for every integration architecture,
- authorization + recoverability + write probe provide stronger relevant evidence.

Typical healthy envelope:

- EIP-712 and recoverability pass,
- raw tx check is `UNSUPPORTED` (expected),
- Zama authorization pass,
- Zama write probe pass,
- final claim can be `ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE`.

If relayer/RPC/registry fails:

- results become `BLOCKED`/`INCONCLUSIVE`,
- claim moves to inconclusive categories,
- without incorrectly labeling adapter compatibility as failed.

This behavior is exactly the intended product behavior for heterogeneous systems.

### 6.3 Reproducible Internal Review Flow (Turnkey)

To review this example with peer engineers:

1. Configure Turnkey credentials in `.env`:
   - `TURNKEY_ORG_ID`,
   - `TURNKEY_PRIVATE_KEY_ID`,
   - `TURNKEY_API_PUBLIC_KEY`,
   - `TURNKEY_API_PRIVATE_KEY`.
2. Run static adapter quality gate:
   - `npm run adapter:check:turnkey`
3. Run preflight diagnostics:
   - `npm run doctor:turnkey`
4. Run harness:
   - `npm run test:turnkey`
5. Optional CI-like gate:
   - `npm run validate:turnkey`

Expected evidence envelope:

- raw transaction execution can legitimately be `UNSUPPORTED`,
- authorization and write claims are still allowed to pass if relevant checks pass,
- infra outages should surface as `BLOCKED`/`INCONCLUSIVE` with infra-rooted error codes.

## 7) What This Product Can and Cannot Claim Today

### 7.1 Strong Claims It Can Make

- Whether authorization compatibility is validated, partial, incompatible, or blocked.
- Whether write compatibility probe succeeded within harness scope.
- Whether failures are likely adapter/signer defects or infra/environment blockers.
- Whether declared adapter model is internally coherent.

### 7.2 Claims It Explicitly Does Not Make

- Full production readiness certification.
- Exhaustive coverage of all Zama SDK paths or all network conditions.
- Deterministic guarantees across all non-Sepolia setups.

## 8) Current Limitations

1. Mainnet profile remains experimental from a validation confidence perspective.
2. Write validation is practical but still not exhaustive across all token/network/relayer permutations.
3. ERC-1271 coverage is diagnostic, not a full smart-account compatibility certification matrix.
4. Live CI is non-blocking by design (good for signal collection, not strict release gating yet).
5. External onboarding is strong but still assumes technically mature integrator teams.

## 9) What Is Needed to Reach “Finished Product” (GA)

To move from partner-pilot ready to GA-grade external product:

1. Formal support policy:
   - explicit supported environments and SDK/network matrix,
   - defined compatibility guarantee boundaries.
2. Hardened live validation governance:
   - stable managed credentials/environments,
   - required artifact review process,
   - release blocking criteria for live regressions.
3. Certification protocol definition:
   - canonical policy files per integration class,
   - required evidence bundle format,
   - auditable run metadata and trace retention.
4. Expanded coverage:
   - broader smart-account/1271 matrix,
   - stronger write/read scenario breadth under controlled fixtures.
5. Security/operations hardening:
   - stricter secret handling guidance and log redaction controls.
6. Public-consumer stability commitments:
   - release cadence,
   - migration policy,
   - compatibility window guarantees.

## 10) Hypotheses and Open Questions

### Hypotheses

- H1: For partner onboarding, scoped compatibility claims are more useful than binary “compatible/incompatible”.
- H2: Most false negatives in early partner runs are infrastructure-related, not cryptographic incompatibility.
- H3: `adapter:check + doctor + validate` is the right minimal command path for rapid triage.

### Open Questions

1. Should some claim classes become release-blocking in live CI, and under which conditions?
2. What minimum evidence bundle should define “Zama-validated partner” internally?
3. How far should the harness go in smart-account-native verification before introducing additional tooling?
4. Which partner archetypes require dedicated policy presets by default (MPC, API-routed custody, smart accounts)?
5. What is the target support boundary for mainnet validation in vNext?

## 11) Recommended Next Version Focus (vNext)

Prioritize:

1. Live-run reliability and artifact governance (stronger operational confidence).
2. Policy presets per integration archetype (faster external adoption).
3. Extended smart-account and advanced write-path scenario coverage.
4. Internal certification rubric based on current claim/evidence contract.

## 12) Conclusion

The harness has reached a meaningful milestone: **trustworthy partner-pilot validation**.

It now behaves as a serious diagnostic product:

- architecture-aware,
- evidence-first,
- conservative in claims,
- actionable in diagnostics,
- CI-consumable and regression-protected.

It is not yet a final certification product, but it is now in a strong state for internal peer review and guided partner integration pilots.
