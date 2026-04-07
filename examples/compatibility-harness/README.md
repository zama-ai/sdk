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

  /** Required — must produce a standard secp256k1 EIP-712 signature. */
  signTypedData: (data: any) => Promise<string>;

  /** Optional — EOA path: sign a raw EIP-1559 transaction (returned as hex). */
  signTransaction?: (tx: any) => Promise<string>;

  /** Optional — MPC / smart-account path: submit a contract call and return the tx hash. */
  writeContract?: (config: {
    address: string;
    abi: readonly any[];
    functionName: string;
    args?: readonly any[];
    value?: bigint;
  }) => Promise<string>;
}
```

Only `signTypedData` is required. Provide `signTransaction` for EOA wallets or
`writeContract` for MPC / smart-account wallets. **No other file needs to change.**

### Example — EOA (viem wallet client)

```ts
import { walletClient } from "./your-client.js";

export const signer: Signer = {
  address: walletClient.account.address,
  signTypedData: (data) => walletClient.signTypedData(data),
  signTransaction: (tx) => walletClient.signTransaction(tx),
};
```

### Example — MPC wallet (Crossmint, Turnkey, Privy, …)

```ts
export const signer: Signer = {
  address: await provider.getAddress(),
  signTypedData: (data) => provider.signTypedData(data),
  // signTransaction not implemented — use writeContract instead
  writeContract: (config) => provider.executeContract(config),
};
```

See [`examples/crossmint/signer.ts`](examples/crossmint/signer.ts) for a full
Crossmint MPC adapter with the expected compatibility report.

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
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Zama Compatibility Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Signer             0xcafe1234…abcd5678
  Type               EOA
  EIP-712            ✓ recoverable (secp256k1)
  signTransaction    ✓ provided (EOA path)
  writeContract      – not provided

  ── Ethereum Compatibility ─────────────────────────────
  ✓ EIP-712 Signature                      PASS
  ✗ Transaction Execution                  FAIL
      Reason:         sendRawTransaction failed: insufficient funds
      Likely cause:   Malformed signed transaction, or account has insufficient Sepolia ETH for gas
      Recommendation: Get Sepolia ETH at sepoliafaucet.com

  ── Zama SDK Compatibility ─────────────────────────────
  ✓ Zama SDK Flow                          PASS

────────────────────────────────────────────────────────
  Final: ZAMA COMPATIBLE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Every failure includes:
- **Reason** — what went wrong
- **Likely cause** — the most probable root cause
- **Recommendation** — what to do next

The **final verdict is determined by the Zama SDK section only** — an Ethereum-section
SKIP (e.g. MPC wallet without `signTransaction`) does not affect compatibility.

---

## What the tests validate

| Order | Test | Section | What it checks |
|-------|------|---------|----------------|
| 1 | Signer Profile | (header) | Detects signer type (EOA / MPC / Smart Account) — never blocks |
| 2 | EIP-712 Signature | Ethereum | Signature is recoverable via `ecrecover` and matches `signer.address` |
| 3 | Transaction Execution | Ethereum | EOA: signs + broadcasts a tx. MPC: skipped (writeContract path used instead) |
| 4 | Zama SDK Flow | Zama | `sdk.allow()` completes — the Zama EIP-712 credential payload is accepted |
