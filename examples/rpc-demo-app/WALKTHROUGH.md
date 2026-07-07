# WALKTHROUGH — rpc-demo-app

## Context

`zama-json-rpc` (write-side) and `confidential-indexer` (read-side), both built
and verified this session under [SDK-149](https://linear.app/zama/issue/SDK-149),
needed a visual demo for a video — something that proves the core value
proposition of both without ever showing FHE-aware code. This app is that demo:
styled like `examples/react-wagmi` (same plain-CSS card design), but it
deliberately never imports `@zama-fhe/sdk` or `@zama-fhe/react-sdk` — the whole
point is showing an ordinary dApp that only ever speaks plain JSON-RPC to the
wrapper and plain REST to the indexer, exactly like a real, unmodified consumer
would.

This project ended up surfacing a genuine, previously-unverified architectural
fact about the write-side wrapper — not just a thin frontend over two
already-proven backends, which is why it gets a WALKTHROUGH of its own.

## The finding: a real wallet can't sign "through" the wrapper

The original plan (confirmed with the user before building) was: connect a
real browser wallet (MetaMask/Rabby), point its own Sepolia RPC setting at the
locally running `zama-json-rpc`, and let it sign+broadcast normally — the
strongest possible version of "zero code change," since it would be literally
unmodified MetaMask. This was tried, and it does not work, for a reason that
only became obvious by actually testing it against a real wallet:

**A real EIP-1193 wallet signs `eth_sendTransaction` client-side, inside the
extension, before making any network call at all.** It never forwards
`eth_sendTransaction` itself over the wire — the only network call it ever
makes is `eth_sendRawTransaction`, carrying an already-signed transaction. This
holds true regardless of which RPC URL the wallet is configured to use, since
that configured endpoint is never consulted for the *unsigned* request in the
first place — there is no request to intercept.

Since the wrapper's entire rewrite trick depends on modifying the *unsigned*
calldata before it's signed (rewriting after signing would invalidate the
signature), and a wallet's signing always happens before any RPC involvement,
**no wallet RPC reconfiguration can make this work** — this isn't a
misconfiguration, it's how EIP-1193 wallets are built.

### How this was actually discovered (not assumed)

1. First attempt: pointed Rabby's Sepolia RPC at the wrapper, sent a transfer.
   The UI hung on "Confirming..." then silently reset — traced to a real gap in
   this app's own error handling (`useWaitForTransactionReceipt`'s error/revert
   states weren't rendered at all), fixed first so the *real* failure would be
   visible.
2. Retried: got `"Unsupported method: eth_sendTransaction"` — traced to the
   wrapper's own `--rpcUrl` still pointing directly at Alchemy instead of
   Rabby, a red herring from an earlier setup step. Fixed.
3. Retried again, now with the RPC chain actually connected end to end: the
   wrapper's own log showed `eth_sendRawTransaction` being forwarded, but
   **never an `eth_sendTransaction`** — and the one `eth_call` that did arrive
   (from viem's automatic revert-reason simulation) carried the *original,
   unrewritten* `transfer(to,amount)` selector, with `sdk.encrypt()` failing on
   it. That combination — raw pre-signed broadcasts only, the plaintext
   selector still present post-signature — is what pinned down the real cause:
   the wallet had already signed the original calldata before the wrapper ever
   saw anything.

Each step was a real, reproduced symptom, not a guess — see the conversation
history around 2026-07-07 for the full transcript if reconstructing this.

## The fix: a persistent signer relay

`scripts/signer-relay.mjs` is a small companion process that holds the real
demo private key and sits as the wrapper's `--rpcUrl` upstream. This app's
Send/Deposit actions POST `eth_sendTransaction` **directly to the wrapper**
via `fetch` (`src/lib/useRelayedSend.ts`), bypassing the connected wallet
entirely for the write path:

```text
This app (Send/Deposit)
    │  eth_sendTransaction, plain calldata, sent directly via fetch
    ▼
zama-json-rpc  ──►  scripts/signer-relay.mjs  ──►  real Sepolia
   (rewrites into the         (signs the *rewritten* request
    real confidential call)    client-side, broadcasts via
                                eth_sendRawTransaction)
```

The relay plays exactly the role `zama-json-rpc`'s own WALKTHROUGH always said
something must play — "whatever actually signs" sitting downstream of the
wrapper — except the concrete shape that takes, when the real signer is meant
to look like a normal wallet-driven flow, is a small dedicated process, not the
wallet extension itself. This is the same role a custodian's own signing
infrastructure would play in production.

The connected wallet (MetaMask/Rabby) is still real, still connected, and
still shown on screen (address, ETH balance) — it's just no longer the one
signing writes, and no longer needs any RPC reconfiguration at all. This is a
weaker "zero code change" story than originally hoped (the wallet doesn't
literally do everything unmodified), but it's an honest one, and it's the only
one that's architecturally possible for this demo's requirements.

## What's implemented

- **Send** (`src/components/SendCard.tsx`) — plain `transfer(to, amount)`
  calldata (viem, no SDK), sent via the relay path above.
- **Deposit into vault** (`src/components/VaultDepositCard.tsx`) — same
  pattern, `transferAndCall(vault, amount, data)`, real deposit into the
  `ConfidentialVault` example contract (`0xb13720bec167A576D715F5aA7C7d68b3dB0A4Ad7`,
  from `examples/react-wagmi`'s SDK-244 demo).
- **Trace log** (`src/components/TraceLog.tsx`, `src/lib/useRelayedSend.ts`) —
  a step-by-step timeline for every Send/Deposit: every request/response this
  browser genuinely exchanges with the wrapper (including its own
  `eth_getTransactionReceipt` polling, done via `fetch` rather than wagmi's
  opaque internal polling so every hop is capturable), the wrapper's own real
  audit-log entry for the same action (polled from its `GET /audit`, added to
  `zama-json-rpc` for this), and one entry clearly marked *inferred* for the
  signer-relay → chain hop, which isn't observable from the browser. Nothing
  fabricated: every entry is either a real captured payload or explicitly
  labeled "inferred".
- **History + delegation badge** (`src/components/HistoryCard.tsx`,
  `DelegationStatusBadge.tsx`) — plain REST reads against
  `confidential-indexer`, showing the real decrypted balance and transfer
  history, and explaining *why* they're visible (an active on-chain
  delegation to this specific indexer identity, not a public view).
- `scripts/grant-delegation.mjs` — one-time setup utility granting the demo
  wallet's permanent delegation to the indexer's dedicated demo identity (real
  tx `0xd92ec15763149b8064f5533de12b1cc36845b5f2fe2faa7a1f68cf49db33af21`,
  block `11217368`).

## Verified for real

- **Headless-browser tests** (Playwright, mocked wallet *connection* only —
  no real extension available headless; every subsequent network call is
  real) confirm: the connect screen and its error paths render with zero
  console errors; the connected dashboard renders real data end-to-end
  (balance, delegation status, transfer history matching
  `confidential-indexer`'s actual REST responses); the Send form's raw
  request preview builds the exact `0xa9059cbb` calldata verified against the
  real relayer throughout the write-side's own verification work.
- **Real broadcasts through the corrected (signer-relay) architecture**,
  driven by the actual UI, not a script:
  - `confidentialTransfer`: tx
    `0x3f3f77f4aa63cc8d217ad9483f6cf0720c022bc1a53d1b49c2dd53cd9bfde38e`,
    real `ConfidentialTransfer` event, gas usage consistent with every other
    real transfer this session (~448k).
  - A second, user-run real transfer:
    `0x2fef254ec26788f108e6d06e06719f4b9860872d739ce3a62b66276360440836`
    — status success, real selector `0x2fb74e62` (not the plaintext
    `0xa9059cbb`), confirming the calldata really was rewritten.
  - A real vault deposit (`transferAndCall`), also user-confirmed successful.
  - The trace log's full 12-step timeline was captured on a real send and
    matches the design exactly (request → response → server audit entry →
    inferred relay step → receipt polls → confirmed).

## Known limitations

1. **Requires manual multi-process setup** (signer relay, wrapper, indexer,
   this app) — no orchestration script, by design (keeps each piece legible
   for a demo/video context rather than hidden behind a compose file).
2. **Single hardcoded token + vault** — not a general-purpose token explorer,
   mirrors exactly what `zama-json-rpc`/`confidential-indexer` were verified
   against this session.
3. **The demo private key is held by a local script and in `.env`/CLI args**
   — fine for a Sepolia-only burner wallet, never do this with a real key.
4. **Trace log's audit-entry correlation is time-window based, not ID-based**
   — fine for the demo's single-action-at-a-time use, would misattribute
   entries under concurrent requests.
5. **No production auth** on this app itself (the two backends it talks to
   have their own, independent `--apiKey` gates).
