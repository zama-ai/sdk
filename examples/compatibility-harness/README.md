# Zama Compatibility Validation Harness

Diagnostic harness to evaluate whether a wallet/custody integration is compatible with the Zama SDK on Sepolia.

The harness is adapter-based (not signer-only) and reports:
- what your integration exposes (capabilities),
- what was actually validated (checks + statuses),
- what claim is safe to make (conservative final verdict).
- where validation was blocked by infrastructure vs adapter/signer behavior.

## What This Harness Can Prove

It can validate, depending on adapter support:
- identity and address resolution,
- EIP-712 signing and `ecrecover` recoverability,
- raw EOA transaction signing + broadcast,
- adapter-routed contract execution,
- contract reads either via adapter or harness RPC fallback (when adapter read is absent),
- Zama authorization flow (`sdk.allow()`),
- a practical Zama write probe (operator approval write + on-chain verification).

It can also separate incompatibility from infrastructure blockers:
- adapter/signer defects,
- RPC/network issues,
- relayer issues,
- registry/token discovery issues,
- environment/configuration issues.

## What It Cannot Prove

- Full production readiness of your integration.
- Every possible Zama SDK write/read path.
- Non-Sepolia behavior (this harness is currently Sepolia-focused).

If a surface is not tested or not supported by the adapter, the report says so explicitly (`UNTESTED` or `UNSUPPORTED`) and the verdict remains partial.

## Quickstart

```bash
git clone <repo>
cd examples/compatibility-harness
npm install
cp .env.example .env
```

### Option A: Built-in EOA adapter

Set `PRIVATE_KEY` in `.env` (Sepolia-funded account), then run:

```bash
npm test
```

Local deterministic mode (no network/relayer/registry dependency):

```bash
HARNESS_MOCK_MODE=1 npm test
```

In mock mode, network-dependent checks are explicitly marked `UNTESTED`.

### Option B: Crossmint example adapter

Set `CROSSMINT_API_KEY` and `CROSSMINT_WALLET_LOCATOR` in `.env`, then run:

```bash
npm run test:crossmint
```

Equivalent:

```bash
SIGNER_MODULE=./examples/crossmint/signer.ts npm test
```

### Option C: Turnkey example adapter

Set Turnkey credentials in `.env` (`TURNKEY_ORG_ID`, `TURNKEY_PRIVATE_KEY_ID`, `TURNKEY_API_PUBLIC_KEY`, `TURNKEY_API_PRIVATE_KEY`), then run:

```bash
npm run test:turnkey
```

Equivalent:

```bash
SIGNER_MODULE=./examples/turnkey/signer.ts npm test
```

Optional Turnkey-specific commands:

```bash
npm run doctor:turnkey
npm run validate:turnkey
```

### Option D: Openfort baseline adapter (EOA semantics)

Set `OPENFORT_TEST_PRIVATE_KEY` in `.env`, then run:

```bash
npm run test:openfort
```

Equivalent:

```bash
SIGNER_MODULE=./examples/openfort/signer.ts npm test
```

This adapter validates Openfort-compatible EOA signing/execution semantics in CLI. It does not validate embedded browser auth/session UX.

Optional Openfort-specific commands:

```bash
npm run doctor:openfort
npm run validate:openfort
```

## Preflight Doctor (Optional)

Run a fast environment preflight before the full suite:

```bash
npm run doctor
```

With a custom adapter:

```bash
SIGNER_MODULE=./examples/turnkey/signer.ts npm run doctor
```

Doctor checks:
- adapter module loading,
- declared capabilities visibility,
- adapter init and address resolution,
- RPC connectivity + chain match,
- relayer reachability.

Exit codes:
- `0`: all checks passed,
- `2`: at least one `BLOCKED` issue (usually env/config),
- `3`: at least one `INCONCLUSIVE` issue (usually infra/network),
- `99`: unexpected harness/runtime error.

## Validation Gate (CI-Friendly)

Run the full harness and return a stable exit code based on the final `claim`:

```bash
npm run validate
```

By default, the gate target is `AUTHORIZATION`. You can require strict auth+write validation:

```bash
VALIDATION_TARGET=AUTHORIZATION_AND_WRITE npm run validate
```

You can also provide a JSON policy file:

```bash
VALIDATION_POLICY_PATH=./validation-policy.example.json npm run validate
```

Policy behavior:
- `VALIDATION_TARGET` overrides `policy.target` when both are set.
- `VALIDATION_ALLOW_PARTIAL=true` can promote `PARTIAL` gate results to exit code `0`.
- `policy.expectedClaims` can restrict accepted claim IDs.

Validation gate exit codes:
- `0`: requested compatibility target validated,
- `10`: partially validated (typically auth passed, write not fully validated, strict target only),
- `20`: incompatible,
- `21`: claim rejected by policy `expectedClaims`,
- `30`: inconclusive (blocked/untested authorization claim),
- `31`: unknown claim mapping,
- `97`: invalid gate config or unreadable report artifact,
- `98`: test runner execution failure,
- `99`: unexpected CLI runtime failure.

`validate` enforces report artifact contract (`kind` + `schemaVersion` + required claim fields) before applying gate policy.

## Adapter Model (Primary Interface)

Bootstrap a custom adapter template:

```bash
npm run init:adapter
```

Optional custom output path:

```bash
npm run init:adapter -- ./examples/my-provider/signer.ts
```

Then run:

```bash
SIGNER_MODULE=./examples/my-provider/signer.ts npm test
```

Provide a module exporting `adapter` (preferred). The harness also accepts legacy `signer` exports for backward compatibility.

```ts
import type { Adapter } from "./src/adapter/types.js";

export const adapter: Adapter = {
  metadata: {
    name: "My Adapter",
    declaredArchitecture: "UNKNOWN",
    verificationModel: "UNKNOWN",
    supportedChainIds: [11155111],
  },
  capabilities: {
    eip712Signing: "SUPPORTED",
    rawTransactionSigning: "UNSUPPORTED",
    contractExecution: "SUPPORTED",
  },
  async init() {
    // optional async initialization
  },
  async getAddress() {
    return "0x...";
  },
  async signTypedData(data) {
    return "0x...";
  },
  async writeContract(config) {
    return "0x..."; // tx hash
  },
};
```

Run with:

```bash
SIGNER_MODULE=./my-adapter.ts npm test
```

No harness source changes are required.

## Capability Model

The harness tracks these capabilities independently from verdicts:
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

The adapter profile reports both:
- `declaredCapabilities` (what the adapter says it supports)
- `observedCapabilities` (what the harness observed from behavior/tests)

When they diverge, the report includes explicit `contradictions`.

## Status Model

Every check uses one status:
- `PASS`
- `FAIL`
- `UNTESTED`
- `UNSUPPORTED`
- `BLOCKED`
- `INCONCLUSIVE`

This avoids false pass/fail claims when something is unavailable or blocked by infrastructure.

## Adapter Classification

Architecture values:
- `EOA`
- `MPC`
- `SMART_ACCOUNT`
- `API_ROUTED_EXECUTION`
- `UNKNOWN`

The report combines declared metadata and observed behavior. If evidence is weak or contradictory, classification remains `UNKNOWN`.

## Test Surface

Current checks:
1. Adapter initialization and address resolution
2. EIP-712 signing + recoverability
3. Raw transaction execution (when supported)
4. Contract read validation (adapter read when available, otherwise harness RPC fallback)
5. Zama authorization flow (`sdk.allow()`)
6. Zama write flow probe (operator approval write + verification)

## Final Verdict Model

The harness emits nuanced verdicts, for example:
- `ZAMA COMPATIBLE FOR AUTHORIZATION AND WRITE FLOWS`
- `ZAMA COMPATIBLE FOR AUTHORIZATION FLOWS — WRITE FLOW NOT TESTED`
- `PARTIALLY VALIDATED — AUTHORIZATION COMPATIBLE, WRITE FLOW UNSUPPORTED`
- `PARTIALLY VALIDATED — AUTHORIZATION PASSED, RECOVERABILITY NOT CONFIRMED`
- `INCOMPATIBLE — ZAMA AUTHORIZATION FLOW FAILED`
- `INCONCLUSIVE — AUTHORIZATION FLOW BLOCKED BY ENVIRONMENT OR INFRASTRUCTURE`

Verdicts are based on what was actually validated, not on assumptions.

## Report Sections

The output is split into:
- Adapter Profile
- Ethereum Compatibility
- Adapter-Routed Execution
- Zama SDK Compatibility
- Infrastructure / Environment
- Final Verdict

Each failing/blocked/inconclusive check includes cause and recommendation.
The infrastructure section is synthesized from root-cause evidence across checks (RPC, relayer, registry, local env).
Checks may include stable `errorCode` values (for CI triage), e.g.:
- `ENV_MISSING_CONFIG`, `ENV_INVALID_CONFIG`, `ENV_INSUFFICIENT_FUNDS`
- `RPC_CONNECTIVITY`, `RPC_RATE_LIMIT`
- `RELAYER_UNAVAILABLE`
- `REGISTRY_EMPTY`, `REGISTRY_UNAVAILABLE`

### Optional JSON artifact

Set `REPORT_JSON_PATH` to export a machine-readable report payload at the end of the run.

```bash
REPORT_JSON_PATH=./reports/latest.json npm test
```

Current schema:
- `kind`: `zama-compatibility-report`
- `schemaVersion`: `1.1.0`
- top-level sections: `adapterProfile`, `checks`, `sections`, `infrastructure`, `claim`, `finalVerdict`

`schemaVersion` is the compatibility contract for CI/partner tooling. Consumers should validate `schemaVersion` before parsing.

See also: [`docs/report-consumption.md`](./docs/report-consumption.md) for CI parsing and gating patterns.

## Environment Variables

Copy `.env.example` to `.env` and fill only what your adapter needs.

Common variables:
- `PRIVATE_KEY` (required for built-in EOA adapter)
- `CROSSMINT_API_KEY` / `CROSSMINT_WALLET_LOCATOR` (Crossmint example)
- `TURNKEY_ORG_ID` / `TURNKEY_PRIVATE_KEY_ID` / `TURNKEY_API_PUBLIC_KEY` / `TURNKEY_API_PRIVATE_KEY` (Turnkey example)
- `OPENFORT_TEST_PRIVATE_KEY` (Openfort EOA baseline example)
- `RPC_URL` (optional; defaults to public Sepolia RPC)
- `RELAYER_URL` (optional; defaults to Zama testnet relayer)
- `RELAYER_API_KEY` (optional; needed for private/protected relayers)
- `REPORT_JSON_PATH` (optional; write final report JSON to this file path)
- `HARNESS_MOCK_MODE` (optional; when enabled, marks network-dependent checks as `UNTESTED`)
- `VALIDATION_POLICY_PATH` (optional; JSON policy for `npm run validate`)
- `VALIDATION_ALLOW_PARTIAL` (optional; override policy to accept `PARTIAL` as pass)

## Integrator Workflow (Target: < 10 min)

1. Clone + install
2. Configure `.env`
3. Point `SIGNER_MODULE` to your adapter (or use built-in EOA)
4. Run `npm test`
5. Read report by sections and final verdict

## Example References

See:
- [`examples/crossmint/signer.ts`](./examples/crossmint/signer.ts)
- [`examples/crossmint/COMPATIBILITY.md`](./examples/crossmint/COMPATIBILITY.md)
- [`examples/turnkey/signer.ts`](./examples/turnkey/signer.ts)
- [`examples/turnkey/COMPATIBILITY.md`](./examples/turnkey/COMPATIBILITY.md)
- [`examples/openfort/signer.ts`](./examples/openfort/signer.ts)
- [`examples/openfort/COMPATIBILITY.md`](./examples/openfort/COMPATIBILITY.md)

## Legacy Compatibility

Legacy modules exporting `signer` are still supported via automatic wrapping, but new integrations should export `adapter` directly.

## Commands

```bash
npm run typecheck
npm test
npm run test:crossmint
npm run test:openfort
npm run test:turnkey
```
