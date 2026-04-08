# Openfort Adapter Compatibility Notes

This document describes expected harness behavior for the Openfort example adapter at [`signer.ts`](./signer.ts).

## Adapter Profile (Declared)

- Name: `Openfort EOA Baseline Adapter`
- Declared architecture: `EOA`
- Verification model: `RECOVERABLE_ECDSA`
- `eip712Signing`: `SUPPORTED`
- `recoverableEcdsa`: `SUPPORTED`
- `rawTransactionSigning`: `SUPPORTED`
- `contractExecution`: `SUPPORTED`
- `contractReads`: `SUPPORTED`
- `transactionReceiptTracking`: `SUPPORTED`
- `zamaAuthorizationFlow`: `SUPPORTED`
- `zamaWriteFlow`: `SUPPORTED`

## What This Example Validates

This adapter is a CLI baseline meant to validate Openfort integrations that run with **EOA semantics** (`wallet address === signing key`).

It validates:

- EIP-712 recoverability expectations used by Zama relayer flows
- raw transaction + contract execution compatibility
- Zama authorization and practical write probe in the harness runtime

## What This Example Does Not Validate

It does **not** validate Openfort front-end/runtime concerns such as:

- `@openfort/react` embedded auth flows
- browser connector lifecycle behavior
- interactive wallet reconnect/recovery UX

Those concerns are covered by the Openfort browser POC in `~/Code/Zama/Tests/OPENFORT/openfort_zama_integration`.

## Expected Validation Pattern

Typical run (valid key, funded wallet, healthy infra):

- Adapter initialization/address resolution: `PASS`
- EIP-712 signing + recoverability: `PASS`
- Raw transaction execution: `PASS`
- Adapter contract read: `PASS`
- Zama authorization flow (`sdk.allow()`): `PASS`
- Zama write flow probe: `PASS`

Expected final verdict:

- `ZAMA COMPATIBLE FOR AUTHORIZATION AND WRITE FLOWS`

### Baseline Lockfile (Regression Guard)

See `src/tests/fixtures/example-baselines/openfort.lock.json`.

Claim envelope tracked by unit tests:

- `PASS`: full auth+write compatibility
- `PARTIAL`: write-surface degradations (blocked/failed/not-recorded)
- `INCONCLUSIVE`: infra/env-blocked authorization outcomes

## Setup

1. Configure `.env`:

```dotenv
OPENFORT_TEST_PRIVATE_KEY=0x...
# Optional override (otherwise RPC_URL is used):
# OPENFORT_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

2. Run:

```bash
npm run test:openfort
```

Equivalent:

```bash
SIGNER_MODULE=./examples/openfort/signer.ts npm test
```

Optional preflight and CI gate:

```bash
npm run doctor:openfort
npm run validate:openfort
```

Strict gate requiring authorization + write compatibility:

```bash
VALIDATION_TARGET=AUTHORIZATION_AND_WRITE npm run validate:openfort
```

Deterministic local mode without network/relayer dependency:

```bash
HARNESS_MOCK_MODE=1 npm run test:openfort
```
