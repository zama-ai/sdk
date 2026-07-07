# rpc-demo-app

A small demo dApp for recording a video of `zama-json-rpc` (write-side) and
`confidential-indexer` (read-side). Styled like `examples/react-wagmi`, but this
app **never imports `@zama-fhe/sdk` or `@zama-fhe/react-sdk`** — that's the whole
point. It only ever:

- sends ordinary-looking, plain calldata (`transfer`) directly to the wrapper, and
- reads decrypted balance/history data from `confidential-indexer`'s REST API.

Everything FHE-related happens invisibly, in the two backend servers — not here.

`zama-json-rpc` itself supports six operations (see its own README), but this
demo deliberately only exercises one write path — `confidentialTransfer`, via a
plain `transfer(to, amount)` — to keep the recording focused. An earlier version
also had a vault-deposit card (`transferAndCall`); removed as a scope decision
(didn't add enough for the video to justify the extra screen time), not because
anything about it was broken — see `WALKTHROUGH.md`.

## How it works

```text
This app (Send)
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

**Why Send doesn't use the connected wallet to sign, and why that's not
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
the write action.

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
   FHE about it. Let the **trace log** play out underneath — it shows, in order,
   the real request sent to the wrapper, the wrapper's own real audit-log entry
   ("matched confidentialTransfer, encrypted via the real relayer"), one clearly
   labeled *inferred* step for the signer-relay's sign+broadcast (the only hop
   not directly observable from the browser), then each real receipt poll until
   mined. After confirmation, open the Etherscan link — the real mined call is
   `confidentialTransfer(to, encryptedAmount, inputProof)`.
2. **Delegation badge + History** — point out the badge explaining *why* the
   balance/history below are visible at all (an on-chain delegation to this one
   indexer, not a public view), then show the decrypted balance and transfer list
   updating from confidential-indexer's REST API.

## Trace log

Send shows a step-by-step trace underneath: each request/response this browser
genuinely exchanges with the wrapper (full JSON payloads, expandable), the
wrapper's own real audit-log entry for the same action (polled from its
`GET /audit`), and one *inferred* step for the hop this browser can't directly
observe. Nothing fabricated — entries are either a real captured payload or
explicitly marked "inferred". See `src/lib/useRelayedSend.ts` and
`src/components/TraceLog.tsx`.

## Non-goals

- No support for multiple tokens/networks — hardcoded to the same cUSDC
  used throughout `zama-json-rpc`/`confidential-indexer`'s own verification work.
- No vault-deposit (`confidentialTransferAndCall`) card — removed as a scope
  decision, see `WALKTHROUGH.md`. The wrapper itself still supports it.
- No production auth — this is a demo recording aid, not a reference integration.
