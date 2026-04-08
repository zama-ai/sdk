# Zama Compatibility Validation Harness

Diagnostic harness to evaluate whether a wallet/custody integration is compatible with the Zama SDK on Sepolia.

The harness is adapter-based (not signer-only) and reports:
- what your integration exposes (capabilities),
- what was actually validated (checks + statuses),
- what claim is safe to make (conservative final verdict).

## What This Harness Can Prove

It can validate, depending on adapter support:
- identity and address resolution,
- EIP-712 signing and `ecrecover` recoverability,
- raw EOA transaction signing + broadcast,
- adapter-routed contract execution,
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

## Adapter Model (Primary Interface)

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
4. Adapter contract read (when supported)
5. Zama authorization flow (`sdk.allow()`)
6. Zama write flow probe (operator approval write + verification)

## Final Verdict Model

The harness emits nuanced verdicts, for example:
- `ZAMA COMPATIBLE FOR AUTHORIZATION AND WRITE FLOWS`
- `ZAMA COMPATIBLE FOR AUTHORIZATION FLOWS — WRITE FLOW NOT TESTED`
- `PARTIALLY VALIDATED — AUTHORIZATION COMPATIBLE, WRITE FLOW UNSUPPORTED`
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

## Environment Variables

Copy `.env.example` to `.env` and fill only what your adapter needs.

Common variables:
- `PRIVATE_KEY` (required for built-in EOA adapter)
- `CROSSMINT_API_KEY` / `CROSSMINT_WALLET_LOCATOR` (Crossmint example)
- `TURNKEY_ORG_ID` / `TURNKEY_PRIVATE_KEY_ID` / `TURNKEY_API_PUBLIC_KEY` / `TURNKEY_API_PRIVATE_KEY` (Turnkey example)
- `RPC_URL` (optional; defaults to public Sepolia RPC)
- `RELAYER_URL` (optional; defaults to Zama testnet relayer)
- `RELAYER_API_KEY` (optional; needed for private/protected relayers)

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

## Legacy Compatibility

Legacy modules exporting `signer` are still supported via automatic wrapping, but new integrations should export `adapter` directly.

## Commands

```bash
npm run typecheck
npm test
npm run test:crossmint
npm run test:turnkey
```
