# rpc-demo-app

A small demo dApp for recording a video of `zama-json-rpc` (write-side) and
`confidential-indexer` (read-side). Styled like `examples/react-wagmi`, but this
app **never imports `@zama-fhe/sdk` or `@zama-fhe/react-sdk`** — that's the whole
point. It only ever:

- sends ordinary-looking, plain calldata (`transfer`, `transferAndCall`)
  directly to the wrapper, and
- reads decrypted balance/history data from `confidential-indexer`'s REST API.

Everything FHE-related happens invisibly, in the two backend servers — not here.

## How it works

```text
This app (Send / Deposit)
    │  eth_sendTransaction, plain calldata, sent directly via fetch
    ▼
zama-json-rpc  ──►  scripts/signer-relay.mjs  ──►  real Sepolia
    (rewrites into the        (signs + broadcasts
     real confidential call)   the rewritten call)

MetaMask/Rabby (connected, display only)
    │  eth_requestAccounts, eth_chainId — no signing involved
    ▼
This app shows the connected address + ETH balance

This app (History, reads)
    │  GET /balances, /transfers, /delegations
    ▼
confidential-indexer  (decrypted, delegation-scoped)
```

**Why Send/Deposit don't use the connected wallet to sign, and why that's not
a shortcut**: a real EIP-1193 wallet (MetaMask, Rabby, ...) signs
`eth_sendTransaction` client-side, inside the extension, *before* making any
network call — it only ever sends the network the already-signed transaction,
via `eth_sendRawTransaction`. The wrapper can only rewrite the *unsigned*
request (rewriting calldata after signing would invalidate the signature), so
positioning it "in front of" a wallet's own signing step doesn't work no
matter which RPC URL the wallet is configured to use — this was tried and
confirmed while building this demo. `scripts/signer-relay.mjs` holds the real
demo key and completes the sign+broadcast step for the *rewritten* request the
wrapper forwards to it — the same role a custodian's own signing
infrastructure plays sitting behind the wrapper in production. The connected
wallet is still real and still shown on screen; it's just not the one signing
the write actions.

## Prerequisites

- Node.js >= 22, MetaMask (or another injected EIP-1193 wallet) installed —
  for displaying the connected address, not for signing.
- `examples/zama-json-rpc` running locally (see its own README).
- `confidential-indexer` running locally (separate branch/worktree — see its README).
- The demo wallet's private key (same one connected in your browser wallet) —
  needed by `scripts/signer-relay.mjs`.

## Setup

You need **four** things running: the signer relay, the wrapper (pointed at
the relay, not directly at a public RPC), the indexer, and this app.

1. **Start the signer relay**, pointed at a real Sepolia RPC:
   ```bash
   cd examples/rpc-demo-app
   SIGNER_PK=<your demo wallet's private key> \
     UPSTREAM_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
     node scripts/signer-relay.mjs
   ```
   Confirm the printed account address matches your connected wallet's address.
2. **Start the write-side wrapper**, pointed at the relay (not at a public RPC):
   ```bash
   cd examples/zama-json-rpc
   npx tsx src/cli.ts --http --rpcUrl http://127.0.0.1:8546 --chainId 11155111 --verbose
   ```
3. **Start the read-side indexer**, pointed directly at a real Sepolia RPC (it
   never sends transactions, so it doesn't need the relay), using the demo's
   dedicated operational key (a delegation to this address needs to exist
   first — see step 4):
   ```bash
   cd examples/confidential-indexer
   INDEXER_OPERATIONAL_PRIVATE_KEY=<demo delegate key> \
     npx tsx src/cli.ts --rpcUrl https://sepolia.gateway.tenderly.co --chainId 11155111 \
     --fromBlock <a recent block> --pollIntervalMs 15000
   ```
4. **One-time**: grant that operational address a (permanent) decrypt delegation
   from your demo wallet, if you haven't already:
   ```bash
   cd examples/rpc-demo-app
   HOLDER_PK=<your demo wallet's key> DELEGATE_ADDRESS=<indexer's operational address> \
     node scripts/grant-delegation.mjs
   ```
5. **Run this app** (MetaMask/Rabby can stay on its normal Sepolia RPC — no
   wallet network reconfiguration needed):
   ```bash
   cd examples/rpc-demo-app
   cp .env.example .env.local   # adjust ports if needed
   npm install
   npm run dev
   ```
   Open `http://localhost:3000`, connect your wallet.

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
- No production auth — this is a demo recording aid, not a reference integration.
