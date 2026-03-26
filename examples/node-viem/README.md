# node-viem — Zama SDK example

Node.js script demonstrating the full ERC-7984 confidential token lifecycle using
`@zama-fhe/sdk` with [viem](https://viem.sh/).

Targets the **Sepolia** testnet with the USDT mock token.

---

## Prerequisites

- Node.js >= 22
- Two Sepolia accounts funded with ETH (for gas)
- A Sepolia RPC endpoint (Infura, Alchemy, or any public node)

The USDT mock token used in this demo is mintable — no prior token balance required.

---

## Setup

```bash
cd examples/node-viem
cp .env.example .env
```

Fill in `.env`:

```env
# Account A — main account (shield, transfer, unshield, delegate)
PRIVATE_KEY=0x<your_private_key_A>

# Account B — delegate account (Section 4 only)
DELEGATE_PRIVATE_KEY=0x<your_private_key_B>

# Sepolia RPC endpoint
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY

# Optional — Sepolia testnet does not require authentication
# RELAYER_API_KEY=your-api-key
```

```bash
npm install
```

---

## Run

```bash
npm start
```

---

## Verifying the run

A successful run prints four section headers. The final lines look like:

```
cUSDT balance (A, final): 40.0 USDT
USDT  balance (A, final): 950.0 USDT

── 4b. Decrypt as delegate ──
Account B reading Account A's cUSDT balance...
cUSDT balance (A, seen by B): 40.0 USDT

── 4c. Revoke delegation ──
Delegation active after revoke: false
```

Exact balance values depend on prior runs (they accumulate). The relative changes
across sections are what matter:

| Operation          | Account A cUSDT | Account A USDT |
| ------------------ | --------------- | -------------- |
| After mint         | unchanged        | +1 000         |
| After shield       | +100             | −100           |
| After transfer     | −10              | unchanged      |
| After unshield     | −50              | +50            |

Each on-chain operation prints its transaction hash **before** waiting for
confirmation — paste any hash into
[Sepolia Etherscan](https://sepolia.etherscan.io) to track it in real time.

---

## What it does

### Section 1 — Setup

Creates two `ViemSigner` instances (Account A and B) from private keys, using a
shared `publicClient` for reads and separate `walletClient`s for signing.
Wires both signers to a shared `RelayerNode`.

`RelayerNode` runs FHE operations in Node.js worker threads — no browser
dependencies required.

### Section 2 — Mint

Calls the USDT mock contract's `mint()` function directly to fund Account A.
On a real token this step is not available; fund your account via a faucet or
transfer instead.

### Section 3 — Confidential token lifecycle

| Step                  | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| Decrypt balance       | Read Account A's confidential cUSDT balance                 |
| Shield                | Approve + wrap 100 USDT into 100 cUSDT                      |
| Decrypt balance       | Confirm new cUSDT balance                                   |
| Confidential transfer | Send 10 cUSDT from A to B (amount encrypted on-chain)       |
| Unshield              | Unwrap 50 cUSDT back to USDT (two-phase: unwrap + finalize) |
| Final balances        | Show cUSDT and USDT balances for Account A                  |

`unshield()` is a two-phase operation. The SDK handles both phases
automatically; progress callbacks let you log each step.

### Section 4 — Delegation

Demonstrates how a backend service (Account B) can decrypt confidential balances
on behalf of users (Account A) without holding their private key:

| Step                | Description                                                          |
| ------------------- | -------------------------------------------------------------------- |
| Grant               | Account A grants Account B decrypt rights via `delegateDecryption()` |
| Decrypt as delegate | Account B reads Account A's cUSDT balance via `decryptBalanceAs()`   |
| Revoke              | Account A revokes delegation via `revokeDelegation()`                |
| Verify              | Confirm delegation is inactive with `isDelegated()`                  |

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
