# Crossmint MPC Wallet — Zama Compatibility Report

This document shows the expected harness output for a Crossmint MPC wallet and explains
how the adapter maps Crossmint APIs to the harness `Signer` interface.

---

## Context

[Crossmint](https://crossmint.com) provides MPC-based smart wallets via a server-side API.
Their wallets:

- **Support** EIP-712 typed data signing via `POST /signatures`
- **Support** contract execution via `POST /transactions`
- **Do not expose** raw transaction signing (expected for MPC/custodial wallets)

The harness is designed to accommodate this: `signTransaction` is optional.
MPC wallets that provide `writeContract` instead will skip the raw transaction test
without affecting the final Zama compatibility verdict.

---

## Signer profile

| Property         | Value                                   |
| ---------------- | --------------------------------------- |
| Type             | MPC                                     |
| EIP-712          | Recoverable (standard secp256k1)        |
| signTransaction  | Not provided                            |
| writeContract    | Provided (via Crossmint `/transactions`)|

---

## Test results

| Section              | Test                  | Result | Notes                                                        |
| -------------------- | --------------------- | ------ | ------------------------------------------------------------ |
| Ethereum             | EIP-712 Signature     | PASS   | Signature verified via `ecrecover`                           |
| Ethereum             | Transaction Execution | SKIP   | `writeContract` path — raw signing not required for Zama SDK |
| Zama SDK             | Zama SDK Flow         | PASS   | `sdk.allow()` completed; EIP-712 payload accepted            |

**Final: ZAMA COMPATIBLE ✓**

---

## Full report output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Zama Compatibility Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Signer             0xcafe1234…abcd5678
  Type               MPC
  EIP-712            ✓ recoverable (secp256k1)
  signTransaction    – not provided
  writeContract      ✓ provided (MPC / smart-account path)

  ── Ethereum Compatibility ─────────────────────────────
  ✓ EIP-712 Signature                      PASS
  – Transaction Execution                  SKIP
      Note:           writeContract path available — raw transaction signing not supported
                      (expected for MPC wallets). On-chain execution will be verified during
                      actual Zama token operations.

  ── Zama SDK Compatibility ─────────────────────────────
  ✓ Zama SDK Flow                          PASS

────────────────────────────────────────────────────────
  Final: ZAMA COMPATIBLE ✓
  Note:  1 Ethereum test skipped — not required for Zama SDK compatibility
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## How the adapter works

### `signTypedData` → Crossmint Signatures API

```
POST /2022-06-09/wallets/{locator}/signatures
{
  "type": "evm-typed-data",
  "params": {
    "typedData": { domain, types, primaryType, message }
  }
}
```

The response includes an operation `id`. The adapter polls
`GET /wallets/{locator}/signatures/{id}` every 2 s until `status === "succeeded"`,
then returns `result.signature`.

### `writeContract` → Crossmint Transactions API

```
POST /2022-06-09/wallets/{locator}/transactions
{
  "params": {
    "calls": [{ "to": "0x…", "data": "0x…", "value": "0" }],
    "chain": "ethereum-sepolia"
  }
}
```

Calldata is encoded with viem's `encodeFunctionData`. The adapter polls
`GET /wallets/{locator}/transactions/{id}` until `status === "succeeded"`,
then returns `result.onChain.txId`.

### `signTransaction` — not implemented

Crossmint does not expose raw transaction signing. The harness skips the raw
transaction test when only `writeContract` is provided. This is expected behaviour
for MPC wallets and does **not** affect the Zama SDK compatibility verdict.

---

## Setup

### 1. Install dependencies

```bash
cd examples/compatibility-harness
npm install
```

### 2. Copy the adapter

```bash
cp examples/crossmint/signer.ts src/signer/index.ts
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
# Crossmint credentials
CROSSMINT_API_KEY=your_server_side_api_key
CROSSMINT_WALLET_LOCATOR=email:alice@example.com:evm-smart-wallet

# Network (Sepolia defaults work out of the box)
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
RELAYER_URL=https://relayer.testnet.zama.org/v2
```

> **Wallet locator formats**
> - `email:alice@example.com:evm-smart-wallet`
> - `userId:abc123:evm-smart-wallet`
> - `phoneNumber:+1234567890:evm-smart-wallet`
>
> See the [Crossmint wallet docs](https://docs.crossmint.com/wallets/smart-wallets/introduction) for details.

### 4. Run the harness

```bash
npm test
```

---

## Key findings

| Finding                          | Detail                                                                 |
| -------------------------------- | ---------------------------------------------------------------------- |
| EIP-712 signatures               | Crossmint produces standard secp256k1 signatures — fully recoverable  |
| Raw transaction signing          | Not supported — use `writeContract` for on-chain operations            |
| Zama SDK credential flow         | Works without modification — only `signTypedData` is required          |
| Async operation model            | Both `/signatures` and `/transactions` require polling until `succeeded` |
| Address resolution               | Resolved once at startup via `GET /wallets/{locator}`                  |
