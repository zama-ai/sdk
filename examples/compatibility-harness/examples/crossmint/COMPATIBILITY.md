# Zama SDK × Crossmint — Compatibility Validation

This document describes how a Crossmint integration team validated compatibility between
**Crossmint MPC wallets** and the **Zama SDK** (ERC-7984 confidential token standard).

It serves both as a step-by-step implementation guide and as evidence of what was done
during validation. Real contract addresses and wallet addresses from the validated run are
used throughout to make the steps concrete.

---

## Context

The Zama SDK requires a signer to perform two operations:

1. **EIP-712 typed data signing** — used to authorize credential generation (FHE keypair
   binding). The resulting signature must be recoverable to the signer's address via
   standard `ecrecover`.
2. **Transaction submission** — used for on-chain operations (confidential transfer,
   shield/unshield). The SDK calls `writeContract`, which encodes the calldata and
   delegates submission to the signer.

Crossmint offers two wallet types:

| Type | EIP-712 signing | Transaction submission | Zama SDK compatible |
|---|---|---|---|
| **MPC** (`type: "mpc"`) | ✅ Returns standard secp256k1 signature | ✅ Server-side via `/transactions` | **Yes** |
| **Smart** (`type: "smart"`) | ❌ Requires user approval + ERC-1271 | — | No |

**Conclusion: Crossmint MPC wallets are fully compatible with the Zama SDK.**

---

## Prerequisites

- A [Crossmint staging account](https://staging.crossmint.com) and a staging API key
  (`sk_staging_...`)
- Node.js 18+ and npm
- Sepolia ETH is **not required** — Test 2 (Transaction Execution) does not apply
  to API-based signers (see [§Test 2 — Expected Difference](#test-2--expected-difference))

---

## Step 1 — Create a Crossmint MPC wallet

An MPC wallet is a server-custodied Ethereum wallet owned by a user identity (email or
phone number). Create one with a single API call:

```bash
curl -X POST https://staging.crossmint.com/api/2025-06-09/wallets \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: sk_staging_..." \
  -d '{
    "type": "evm-mpc-wallet",
    "linkedUser": "email:dev@example.com"
  }'
```

Response:

```json
{
  "type": "evm-mpc-wallet",
  "address": "0x4dc913f595d8d4B76181B511aD478bbe6680A9C6",
  "linkedUser": "email:dev@example.com"
}
```

Note the wallet `address` — this is the on-chain Ethereum address for this wallet.
Note the `linkedUser` value — this becomes your `CROSSMINT_SIGNER` environment variable.

> **Wallet type note:** Use `type: "evm-mpc-wallet"`, not `"evm-smart-wallet"`.
> Smart wallets require user approval for every signature and produce ERC-1271
> (contract-validated) signatures that are incompatible with Zama's relayer.

---

## Step 2 — Clone and set up the harness

```bash
git clone https://github.com/zama-ai/sdk.git
cd sdk/examples/compatibility-harness
npm install
```

---

## Step 3 — Implement the Crossmint signer

The harness has one integration point: `src/signer/index.ts`. Replace its contents with
the Crossmint adapter:

```bash
cp examples/crossmint/signer.ts src/signer/index.ts
```

The adapter (`examples/crossmint/signer.ts`) implements the two-method `Signer` interface:

```ts
export interface Signer {
  address: string;
  signTypedData: (data: any) => Promise<string>;  // → Crossmint /signatures
  signTransaction: (tx: any) => Promise<string>;  // → not applicable (see below)
}
```

`signTypedData` calls `POST /wallets/{address}/signatures` with the EIP-712 payload and
polls the result endpoint every 1.5 s until `status === "success"`. The returned
`outputSignature` is a standard 65-byte secp256k1 hex signature.

---

## Step 4 — Configure the environment

```bash
cp examples/crossmint/.env.crossmint.example .env
```

Edit `.env` with the values from Step 1:

```dotenv
CROSSMINT_API_KEY=sk_staging_...
CROSSMINT_WALLET=0x4dc913f595d8d4B76181B511aD478bbe6680A9C6
CROSSMINT_SIGNER=email:dev@example.com
CROSSMINT_CHAIN=ethereum-sepolia
```

`RPC_URL` and `RELAYER_URL` can be left at their defaults (public Sepolia endpoints).

---

## Step 5 — Run the harness

```bash
npm test
```

---

## Step 6 — Interpret the results

### Expected output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Zama Compatibility Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ EIP-712 Signature              PASS
  ✗ Transaction Execution          FAIL  (expected — see below)
  ✓ Zama SDK Flow                  PASS
  ✓ Signer Type Detection          PASS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Final: COMPATIBLE* (3/3 Zama-relevant tests passed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Test-by-test breakdown

| # | Test | Result | Notes |
|---|---|---|---|
| 1 | EIP-712 Signature | **PASS** | Crossmint MPC returns standard secp256k1 signature; `ecrecover` recovers `0x4dc913…` |
| 2 | Transaction Execution | **EXPECTED DIFFERENCE** | See §below |
| 3 | Zama SDK Flow | **PASS** | `sdk.allow(tokenAddress)` completes; credentials authorized |
| 4 | Signer Type Detection | **PASS** | Signature type: EOA-recoverable secp256k1 |

---

## Test 2 — Expected Difference

The harness's Transaction Execution test calls `signTransaction(tx)` and then broadcasts
the result via `eth_sendRawTransaction`. This pattern assumes the signer returns a raw
RLP-encoded signed transaction.

Crossmint MPC wallets do not expose this primitive. Transactions are submitted via:

```
POST /wallets/{address}/transactions
{
  "params": {
    "chain": "ethereum-sepolia",
    "call": { "to": "0x...", "data": "0x..." }
  }
}
```

Crossmint handles nonce management, gas estimation, signing, and broadcasting
server-side. A raw signed transaction is never returned to the caller.

**This is not a Zama SDK incompatibility.** The Zama SDK's `GenericSigner` interface
uses `writeContract` (not raw `signTransaction`). In a full SDK integration,
`writeContract` maps directly to Crossmint's `/transactions` endpoint, as demonstrated
in the end-to-end validation below.

---

## End-to-end validation (beyond the harness)

The harness validates the signing primitives (Tests 1, 3, 4). To confirm all ERC-7984
flows work end-to-end with a real Crossmint wallet, a full flow test was also run using
the Zama SDK with a custom `GenericSigner` adapter wiring `writeContract` to Crossmint's
`/transactions` endpoint.

**Validated flows (9/9 PASS — Sepolia, 2026-03-03):**

| Flow | Result | Duration |
|---|---|---|
| Balance reveal (`balanceOf`) | PASS | ~9 s |
| Confidential transfer (1 base unit) | PASS | ~92 s |
| Shield / wrap (0.5 USDC → cUSDCMock) | PASS | ~181 s |
| Balance reveal post-shield | PASS | ~9 s |
| Partial unshield (0.25 cUSDCMock → USDC) | PASS | ~207 s |
| Unshield all | PASS | ~210 s |
| Balance reveal post-unshield (verify 0) | PASS | ~9 s |
| Activity feed parsing (on-chain logs) | PASS | ~1 s |
| Token discovery (`underlying()`) | PASS | ~0.1 s |

**Test wallet:** `0x4dc913f595d8d4B76181B511aD478bbe6680A9C6`  
**Confidential token (cUSDCMock):** `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639`  
**Underlying token (USDCMock):** `0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF`  
**Network:** Ethereum Sepolia (chainId 11155111)  
**Relayer:** `https://relayer.testnet.zama.org`

---

## Implementing a full `GenericSigner` for production

For a production integration, build a `GenericSigner` that delegates:

```ts
import type { GenericSigner } from "@zama-fhe/sdk";

export function buildCrossmintGenericSigner(
  walletAddress: string,
  apiKey: string,
  chain: string,
  signerLocator: string,
): GenericSigner {
  const client = new CrossmintApiClient(apiKey);

  return {
    getAddress: async () => walletAddress,
    getChainId: async () => 11155111,

    // EIP-712 signing → Crossmint /signatures
    signTypedData: (data) =>
      client.createAndPollSignature({ wallet: walletAddress, chain, signer: signerLocator, typedData: data }),

    // Contract reads → public RPC (Crossmint is not involved)
    readContract: (config) => publicClient.readContract(config),

    // Transaction submission → Crossmint /transactions
    writeContract: async (config) => {
      const data = encodeFunctionData({ abi: config.abi, functionName: config.functionName, args: config.args });
      return client.createAndPollTransaction({ wallet: walletAddress, chain, call: { to: config.address, data } });
    },

    // Receipt polling → public RPC
    waitForTransactionReceipt: (hash) => publicClient.waitForTransactionReceipt({ hash }),
  };
}
```

See [`crossmint-generic-signer.ts`](../../../../crossmint-integration/crossmint-generic-signer.ts)
for the full implementation used during end-to-end validation.
