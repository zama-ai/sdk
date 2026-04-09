# Crossmint Adapter Compatibility Notes

This document describes the expected harness behavior for the Crossmint example adapter at [`signer.ts`](./signer.ts).

## Adapter Profile (Declared)

- Name: `Crossmint API-Routed Adapter`
- Declared architecture: `API_ROUTED_EXECUTION`
- Verification model: `UNKNOWN` (confirmed by tests if recoverable)
- `eip712Signing`: `SUPPORTED`
- `rawTransactionSigning`: `UNSUPPORTED`
- `contractExecution`: `SUPPORTED`
- `zamaAuthorizationFlow`: `SUPPORTED`
- `zamaWriteFlow`: `SUPPORTED`

Crossmint is API-routed: no raw tx signing primitive is exposed, but write execution is supported through `/transactions`.

## Expected Validation Pattern

Typical run (with valid credentials and healthy infra):

- Adapter initialization/address resolution: `PASS`
- EIP-712 recoverability: `PASS`
- Raw transaction execution: `UNSUPPORTED` (expected)
- Adapter contract read: `PASS` (validated via harness RPC fallback because `readContract` is not exposed)
- Zama authorization flow (`sdk.allow()`): `PASS`
- Zama write flow probe: `PASS`

Expected final verdict:

- `ZAMA COMPATIBLE FOR AUTHORIZATION AND WRITE FLOWS`

If relayer/RPC/registry fails, statuses can become `BLOCKED` or `INCONCLUSIVE` without implying adapter incompatibility.

### Baseline Lockfile (Regression Guard)

See `src/tests/fixtures/example-baselines/crossmint.lock.json`.

Claim envelope tracked by unit tests:

- `PASS`: full auth+write compatibility
- `PARTIAL`: scoped write degradations (blocked/failed/not-recorded)
- `INCONCLUSIVE`: infra/env-blocked authorization outcomes

## API Mapping Used by the Example

- `adapter.getAddress`:
- `GET /wallets/{locator}` (unless `CROSSMINT_WALLET_ADDRESS` is preconfigured)
- `adapter.signTypedData`:
- `POST /wallets/{locator}/signatures` with `type: evm-typed-data`, then poll operation
- `adapter.writeContract`:
- encode calldata with viem
- `POST /wallets/{locator}/transactions`, then poll operation
- return on-chain transaction hash

## Setup

1. Configure `.env`:

```dotenv
CROSSMINT_API_KEY=your_server_side_api_key
CROSSMINT_WALLET_LOCATOR=email:alice@example.com:evm-smart-wallet
# Optional:
# CROSSMINT_WALLET_ADDRESS=0x...
```

2. Run:

```bash
npm run test:crossmint
```

Equivalent:

```bash
SIGNER_MODULE=./examples/crossmint/signer.ts npm test
```

Optional preflight and CI gate:

```bash
npm run doctor:crossmint
npm run validate:crossmint
```

Strict gate requiring authorization + write compatibility:

```bash
VALIDATION_TARGET=AUTHORIZATION_AND_WRITE npm run validate:crossmint
```

## Interpretation Guidance

- `UNSUPPORTED` raw transaction checks are normal for Crossmint and do not invalidate Zama compatibility claims when authorization + write probe pass.
- `contractReads` capability remains `UNSUPPORTED` for the adapter itself even when the harness can validate read behavior through its RPC fallback.
- A `PASS` on authorization alone is not enough to claim full write compatibility.
- The harness verdict is scoped: trust the exact phrase emitted in `Final`.
