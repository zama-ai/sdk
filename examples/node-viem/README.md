# node-viem — Zama SDK example

Node.js script demonstrating the full ERC-7984 confidential token lifecycle using
`@zama-fhe/sdk` with [viem](https://viem.sh/).

Targets the **Sepolia** testnet with the USDT mock token.

---

## Prerequisites

- Node.js >= 22
- Two Sepolia accounts funded with ETH (for gas)
- A Sepolia RPC endpoint (Infura, Alchemy, or any public node)

The USDT mock token used in this demo is mintable, so no prior public token balance is
required.

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

# ERC-20 token address — the SDK resolves the confidential wrapper via the on-chain registry
TOKEN_ADDRESS=0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0

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

```text
cUSDT balance (A, final): 40.0 USDT
USDT  balance (A, final): 950.0 USDT

── 4b. Decrypt as delegate ──
Account B reading Account A's cUSDT balance...
cUSDT balance (A, seen by B): 40.0 USDT

── 4c. Revoke delegation ──
Delegation active after revoke: false
```

Exact balance values depend on prior runs. The relative changes across sections are what
matter:

| Operation      | Account A cUSDT | Account A USDT |
| -------------- | --------------- | -------------- |
| After mint     | unchanged       | +1 000         |
| After shield   | +100            | −100           |
| After transfer | −10             | unchanged      |
| After unshield | −50             | +50            |

Each on-chain operation prints its transaction hash before waiting for confirmation, so
you can inspect it on [Sepolia Etherscan](https://sepolia.etherscan.io).

---

## What it does

### Section 1 — Setup

Creates one shared viem `publicClient` for reads and one `walletClient` per account for
signing. Then it builds one SDK config per wallet with:

- `createConfig` from `@zama-fhe/sdk/viem`
- the Sepolia preset from `@zama-fhe/sdk/chains`
- the Node.js relayer transport from `@zama-fhe/sdk/node`
- per-wallet `MemoryStorage`

The `node()` transport runs FHE operations in Node.js worker threads — no browser
dependencies required.

### Section 2 — Mint

Calls the USDT mock contract's `mint()` function directly to fund Account A. On a real
token this step is not available; fund the account through normal token distribution
instead.

### Section 3 — Confidential token lifecycle

| Step                  | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| Decrypt balance       | Read Account A's confidential cUSDT balance                 |
| Shield                | Approve + wrap 100 USDT into 100 cUSDT                      |
| Decrypt balance       | Confirm new cUSDT balance                                   |
| Confidential transfer | Send 10 cUSDT from A to B (amount encrypted on-chain)       |
| Unshield              | Unwrap 50 cUSDT back to USDT (two-phase: unwrap + finalize) |
| Final balances        | Show cUSDT and USDT balances for Account A                  |

`unshield()` is a two-phase operation. The SDK handles both phases automatically, and
the progress callbacks log each step.

`shield()` is SDK-owned routing: ERC-1363 tokens may use `transferAndCall`, while other
tokens use approve + wrap. The example keeps the high-level `token.shield()` call and
does not reimplement the path selection.

### Section 4 — Delegation

Demonstrates how a backend service (Account B) can decrypt confidential balances on
behalf of users (Account A) without holding their private key:

| Step                | Description                                                          |
| ------------------- | -------------------------------------------------------------------- |
| Grant               | Account A grants Account B decrypt rights via `delegateDecryption()` |
| Decrypt as delegate | Account B reads Account A's cUSDT balance via `decryptBalanceAs()`   |
| Revoke              | Account A revokes delegation via `revokeDelegation()`                |
| Verify              | Confirm delegation is inactive with `isActive()`                     |

The script retries `DelegationNotPropagatedError` because Sepolia ACL propagation can
take one or two minutes.

---

## Storage note

This example uses `MemoryStorage` for simplicity — FHE credentials are lost when the
process exits. In a production backend, implement `GenericStorage` backed by a
persistent store such as Redis so credentials survive process restarts.

For per-request isolation in an HTTP server, the SDK exports `asyncLocalStorage` from
`@zama-fhe/sdk/node`, which wraps Node.js `AsyncLocalStorage`.

---

## Relayer authentication

The Sepolia testnet relayer does not require authentication. For authenticated
deployments, set `RELAYER_API_KEY` in `.env`; the example attaches it to the chain config
passed into `createConfig`.
