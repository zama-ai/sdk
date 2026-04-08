# Turnkey Adapter Compatibility Notes

This document describes expected harness behavior for the Turnkey example adapter at [`signer.ts`](./signer.ts).

## Adapter Profile (Declared)

- Name: `Turnkey API Key Adapter`
- Declared architecture: `API_ROUTED_EXECUTION`
- Verification model: `UNKNOWN` (validated by observed recoverability checks)
- `eip712Signing`: `SUPPORTED`
- `rawTransactionSigning`: `UNSUPPORTED`
- `contractExecution`: `SUPPORTED`
- `contractReads`: `SUPPORTED`
- `transactionReceiptTracking`: `SUPPORTED`
- `zamaAuthorizationFlow`: `SUPPORTED`
- `zamaWriteFlow`: `SUPPORTED`

This adapter is server-side and non-interactive: it uses Turnkey API key authentication with `@turnkey/http` + `@turnkey/viem`.

## Expected Validation Pattern

Typical run (valid credentials, funded wallet, healthy RPC/relayer):

- Adapter initialization/address resolution: `PASS`
- EIP-712 recoverability: `PASS`
- Raw transaction execution: `UNSUPPORTED` (expected in this adapter)
- Adapter contract read: `PASS`
- Zama authorization flow (`sdk.allow()`): `PASS`
- Zama write flow probe: `PASS`

Expected final verdict:
- `ZAMA COMPATIBLE FOR AUTHORIZATION AND WRITE FLOWS`

If relayer/RPC/registry fails, statuses can become `BLOCKED` or `INCONCLUSIVE` without implying Turnkey incompatibility.

## Environment Variables

Required:

```dotenv
TURNKEY_ORG_ID=...
TURNKEY_PRIVATE_KEY_ID=...
TURNKEY_API_PUBLIC_KEY=...
TURNKEY_API_PRIVATE_KEY=...
```

Optional:

```dotenv
# If omitted, address is resolved from the Turnkey key metadata.
TURNKEY_WALLET_ADDRESS=0x...

# Defaults:
# TURNKEY_BASE_URL=https://api.turnkey.com
# TURNKEY_RPC_URL=<RPC_URL or public Sepolia fallback>
```

The adapter also accepts `VITE_TURNKEY_ORG_ID`, `VITE_TURNKEY_PRIVATE_KEY_ID`, and `VITE_TURNKEY_WALLET_ADDRESS` to ease reuse from the existing Turnkey demo project.

## Setup

1. Fill `.env` with Turnkey credentials.
2. Run:

```bash
npm run test:turnkey
```

Equivalent:

```bash
SIGNER_MODULE=./examples/turnkey/signer.ts npm test
```

Optional preflight and CI gate:

```bash
npm run doctor:turnkey
npm run validate:turnkey
```

Strict gate requiring authorization + write compatibility:

```bash
VALIDATION_TARGET=AUTHORIZATION_AND_WRITE npm run validate:turnkey
```

## Interpretation Guidance

- This example intentionally does not expose `signTransaction`; raw-transaction checks are expected to be `UNSUPPORTED`.
- Zama compatibility claims should follow the exact scoped final verdict from the harness report.
- A failing run caused by invalid API keys, policy restrictions, or RPC outages should be interpreted as environment/infrastructure blockers, not immediate adapter incompatibility.
