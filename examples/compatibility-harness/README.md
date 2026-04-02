# Zama Compatibility Validation Harness

A developer tool that validates whether your signing system is compatible with:

- **Ethereum EOA signing** — standard `secp256k1` key pairs
- **EIP-712 typed data** — signatures recoverable via `ecrecover`
- **Zama SDK** — ERC-7984 confidential token flows (credential authorization)

---

## Who this is for

Infrastructure teams, custody providers, and wallet integrators (e.g. Crossmint, Openfort, Turnkey) who want to verify their signing stack works with the Zama SDK before building a full integration.

---

## Quickstart

```bash
git clone <repo>
cd examples/compatibility-harness

npm install

cp .env.example .env
# Edit .env — set PRIVATE_KEY at minimum (see below)

npm test
```

---

## How to implement your signer

Open `src/signer/index.ts`. You will see:

```ts
// TODO: Replace this with your own signer implementation.
```

Replace the default viem/EOA implementation with your own. The only constraint is that your export satisfies this interface:

```ts
export interface Signer {
  address: string;
  signTypedData: (data: any) => Promise<string>;
  signTransaction: (tx: any) => Promise<string>;
}
```

**No other file needs to change.**

### Example — viem wallet client

```ts
import { walletClient } from "./your-client.js";

export const signer: Signer = {
  address: walletClient.account.address,
  signTypedData: (data) => walletClient.signTypedData(data),
  signTransaction: (tx) => walletClient.signTransaction(tx),
};
```

### Example — external custody SDK (pseudo-code)

```ts
import { CustodyProvider } from "@your-custody/sdk";

const provider = new CustodyProvider({ apiKey: process.env.CUSTODY_API_KEY });

export const signer: Signer = {
  address: await provider.getAddress(),
  signTypedData: (data) => provider.signTypedData(data),
  signTransaction: (tx) => provider.signTransaction(tx),
};
```

---

## Environment variables

Copy `.env.example` to `.env` and configure:

| Variable          | Required | Default                                        | Description                                         |
| ----------------- | -------- | ---------------------------------------------- | --------------------------------------------------- |
| `PRIVATE_KEY`     | Yes      | —                                              | Private key for the default EOA signer (`0x...`)    |
| `RPC_URL`         | No       | `https://ethereum-sepolia-rpc.publicnode.com`  | Sepolia JSON-RPC endpoint                           |
| `RELAYER_URL`     | No       | `https://relayer.testnet.zama.org/v2`          | Zama relayer base URL                               |
| `RELAYER_API_KEY` | No       | _(empty)_                                      | API key for private/mainnet relayers (`x-api-key`)  |

> **Gas:** Test 2 (Transaction Execution) sends a zero-value self-transfer and costs only gas.
> Get Sepolia ETH at [sepoliafaucet.com](https://sepoliafaucet.com) or [faucet.alchemy.com](https://faucet.alchemy.com/faucets/ethereum-sepolia).

---

## Supported networks

| Network | Chain ID | Relayer |
| ------- | -------- | ------- |
| Sepolia | 11155111 | `https://relayer.testnet.zama.org/v2` (no API key needed) |

---

## How to read the report

After `npm test`, a summary is printed at the end:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Zama Compatibility Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ EIP-712 Signature              PASS
  ✓ Transaction Execution          PASS
  ✗ Zama SDK Flow                  FAIL
      Reason:         sdk.allow() failed: Signature not recoverable
      Likely cause:   EIP-712 signature rejected or incompatible with Zama SDK format
      Recommendation: Ensure the signer produces standard secp256k1 EIP-712 signatures
  ✓ Signer Type Detection          PASS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Final: INCOMPATIBLE (1 of 4 tests failed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Every failure includes:
- **Reason** — what went wrong
- **Likely cause** — the most probable root cause
- **Recommendation** — what to do next

---

## What the tests validate

| # | Test | What it checks |
|---|------|----------------|
| 1 | EIP-712 Signature | Signature is recoverable via `ecrecover` and matches `signer.address` |
| 2 | Transaction Execution | Signer can sign + broadcast a transaction; receipt is `success` |
| 3 | Zama SDK Flow | `sdk.credentials.allow()` completes — the Zama EIP-712 payload is signed correctly |
| 4 | Signer Type Detection | Standalone EOA check — detects ERC-1271, MPC, or AA wallets |
