# rpc-demo-app

A small demo dApp for recording a video of `zama-json-rpc` (write-side) and
`confidential-indexer` (read-side). Styled like `examples/react-wagmi`, but this
app **never imports `@zama-fhe/sdk` or `@zama-fhe/react-sdk`** — that's the whole
point. It only ever:

- sends ordinary-looking, plain calldata (`transfer`, `transferAndCall`) via
  real MetaMask, and
- reads decrypted balance/history data from `confidential-indexer`'s REST API.

Everything FHE-related happens invisibly, in the two backend servers — not here.

## How it works

```text
MetaMask (real wallet, unmodified)
    │  eth_sendTransaction — signs + broadcasts via ITS OWN configured RPC
    ▼
zama-json-rpc  ──►  real Sepolia   (transparently rewrites into a confidential call)

This app (reads only)
    │  eth_call / eth_getBalance / ...           │  GET /balances, /transfers, /delegations
    ▼                                             ▼
zama-json-rpc  ──►  real Sepolia          confidential-indexer  (decrypted, delegation-scoped)
```

The one thing that makes the write path actually go through the wrapper:
**MetaMask's own Sepolia RPC setting**, not anything this app's code does (wagmi's
`transports` config only backs this app's own read client — an injected wallet
signs+broadcasts via its own provider, verified while building this). See Setup.

## Prerequisites

- Node.js >= 22, MetaMask (or another injected EIP-1193 wallet) installed.
- `examples/zama-json-rpc` running locally (see its own README).
- `confidential-indexer` running locally (separate branch/worktree — see its README).
- A funded Sepolia wallet holding some cUSDC
  (`0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639`) connected in MetaMask.

## Setup

1. **Start the write-side wrapper**, pointed at a real Sepolia RPC:
   ```bash
   cd examples/zama-json-rpc
   npx tsx src/cli.ts --http --rpcUrl https://ethereum-sepolia-rpc.publicnode.com --chainId 11155111
   ```
2. **Start the read-side indexer**, using the demo's dedicated operational key (a
   delegation to this specific address needs to exist first — see step 3):
   ```bash
   cd examples/confidential-indexer
   INDEXER_OPERATIONAL_PRIVATE_KEY=<demo delegate key> \
     npx tsx src/cli.ts --rpcUrl https://sepolia.gateway.tenderly.co --chainId 11155111 \
     --fromBlock <a recent block> --pollIntervalMs 15000
   ```
3. **One-time**: grant that operational address a (permanent) decrypt delegation
   from your demo wallet, if you haven't already:
   ```bash
   cd examples/rpc-demo-app
   HOLDER_PK=<your demo wallet's key> DELEGATE_ADDRESS=<indexer's operational address> \
     node scripts/grant-delegation.mjs
   ```
4. **Point MetaMask's Sepolia RPC at the wrapper** — this is the step that makes
   Send/Deposit actually flow through `zama-json-rpc`:
   - MetaMask → Settings → Networks → Sepolia → edit the RPC URL to
     `http://127.0.0.1:8545` (or add it as a second "Sepolia (demo)" network,
     same chain ID, so you can switch back easily afterward).
5. **Run this app**:
   ```bash
   cd examples/rpc-demo-app
   cp .env.example .env.local   # adjust ports if needed
   npm install
   npm run dev
   ```
   Open `http://localhost:3000`, connect MetaMask.

Revert MetaMask's Sepolia RPC to a normal public endpoint when you're done —
leaving it pointed at a local dev server will break MetaMask for that network
once the wrapper isn't running.

## Suggested recording flow

1. **Send** — fill in an amount + any recipient, hit Send. Point out the raw
   `eth_sendTransaction` payload shown on screen: `transfer(to, amount)`, nothing
   FHE about it. After confirmation, open the Etherscan link — the real mined
   call is `confidentialTransfer(to, encryptedAmount, inputProof)`.
2. **Deposit into vault** — same idea, `transferAndCall`, real deposit into the
   `ConfidentialVault` example contract.
3. **Delegation badge + History** — point out the badge explaining *why* the
   balance/history below are visible at all (an on-chain delegation to this one
   indexer, not a public view), then show the decrypted balance and transfer list
   updating from confidential-indexer's REST API.

## Non-goals

- No support for multiple tokens/networks — hardcoded to the same cUSDC + vault
  used throughout `zama-json-rpc`/`confidential-indexer`'s own verification work.
- No production auth, no wallet other than MetaMask injected — this is a demo
  recording aid, not a reference integration.
