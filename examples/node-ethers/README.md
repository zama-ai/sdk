# node-ethers — Zama SDK example

Node.js script demonstrating the full ERC-7984 confidential token lifecycle using
`@zama-fhe/sdk` with [ethers v6](https://docs.ethers.org/v6/).

Targets the **Sepolia** testnet with the USDT mock token.

---

## Prerequisites

- Node.js >= 22
- Two Sepolia accounts funded with ETH (for gas)
- A Sepolia RPC endpoint (Infura, Alchemy, or any public node)

---

## Setup

```bash
cp .env.example .env
# Fill in PRIVATE_KEY, DELEGATE_PRIVATE_KEY, SEPOLIA_RPC_URL
npm install
```

---

## Run

```bash
npm start
```

---

## What it does

### Section 1 — Setup

Initialises the ethers `Wallet` + `JsonRpcProvider`, creates two `EthersSigner`
instances (Account A and Account B), and wires them up to a shared `RelayerNode`.

`RelayerNode` runs FHE operations in Node.js worker threads — no browser
dependencies required. A single instance is shared between both SDK objects.

### Section 2 — Mint

Calls the USDT mock contract's `mint()` function directly to fund Account A.
On a real token this step is not available; fund your account via a faucet or
transfer instead.

### Section 3 — Confidential token lifecycle

| Step | Description |
|---|---|
| Decrypt balance | Read Account A's confidential cUSDT balance |
| Shield | Approve + wrap 100 USDT into 100 cUSDT |
| Decrypt balance | Confirm new cUSDT balance |
| Confidential transfer | Send 10 cUSDT from A to B (amount encrypted on-chain) |
| Unshield | Unwrap 50 cUSDT back to USDT (two-phase: unwrap + finalize) |
| Final balances | Show cUSDT and USDT balances for Account A |

`unshield()` is a two-phase operation. The SDK handles both phases
automatically; progress callbacks let you log each step.

### Section 4 — Delegation

Demonstrates how a backend service (Account B) can decrypt confidential balances
on behalf of users (Account A) without holding their private key:

| Step | Description |
|---|---|
| Grant | Account A grants Account B decrypt rights via `delegateDecryption()` |
| Decrypt as delegate | Account B reads Account A's cUSDT balance via `decryptBalanceAs()` |
| Revoke | Account A revokes delegation via `revokeDelegation()` |
| Verify | Confirm delegation is inactive with `isDelegated()` |

---

## Storage note

This example uses `MemoryStorage` for simplicity — FHE credentials are lost when
the process exits. In a production backend, implement `GenericStorage` backed by
a persistent store (e.g. Redis) so credentials survive process restarts.

For per-request isolation in an HTTP server (each request gets its own credential
context), the SDK also exports `AsyncLocalMapStorage` from `@zama-fhe/sdk/node`,
which uses Node.js `AsyncLocalStorage` under the hood — see the SDK documentation
for usage.

---

## Relayer authentication

The Sepolia testnet relayer does not require authentication.
For Mainnet, set `RELAYER_API_KEY` in your `.env`:

```env
RELAYER_API_KEY=your-api-key
```
