# Utila Integration — Internal Notes

**Audience:** Zama SDK team (internal)
**Subject:** How the six capabilities Utila asked for map onto the SDK's offline-signing pipeline
**Status:** Internal working doc
**Date:** 2026-07-08

---

## 1. Purpose

Utila asked for six things: an offline (deferred) signing flow, view keys stored in and
retrieved from their own vault, transactions published through their own RPC, an explicit
view-key activation API (not lazy-on-first-`balanceOf`), and unbundled shield / unshield so
each on-chain transaction can go through its own signing session.

This doc records how each maps onto the current SDK so we can answer Utila consistently and
scope any gaps. All six are supported today on the `feature/sdk-75-deferred-signing-v2`
branch — they are not separate features but facets of one design: run the SDK
**signer-less** (read-only RPC provider, no in-process key) and every write becomes a
three-phase pipeline where signing is delegated entirely to Utila:

```
prepare  →  sign  →  broadcast
(SDK)       (Utila)    (SDK)
```

The policy-approval / MPC-signing wait sits between `prepare` and `broadcast`, fully in the
integrator's control — the SDK never blocks inside a call waiting on the signing ceremony.
Each section below covers one of the six asks with the real API, then §9 flags the one place
where what Utila wants is a protocol constraint the SDK cannot work around today
(deterministic unshield `requestId`).

We already have a working end-to-end integration of this pipeline against a real custody
provider (DFNS) + Sepolia + the FHEVM relayer (§10), so the surface below is
battle-tested, not a blank-page design.

---

## 2. The base setup Utila plugs into

The canonical pattern configures the SDK **with no signer at all** — only a read-only RPC
provider and your own storage. Utila is the only component that touches keys.

```ts
import { createPublicClient, http } from "viem";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk"; // or `node()` from "@zama-fhe/sdk/node"
import { sepolia } from "@zama-fhe/sdk/chains";
import { ZamaSDK, type GenericStorage } from "@zama-fhe/sdk";

// (Feature 3) Your own RPC — reads, gas/nonce estimation, and broadcast all go here.
const publicClient = createPublicClient({
  chain: viemSepolia,
  transport: http("https://sepolia-rpc.utila.internal/<key>"),
});

// (Feature 2) Your own encrypted vault behind the storage interface.
const config = createConfig({
  chains: [sepolia],
  publicClient, // NO walletClient → SDK is read-only, cannot sign
  relayers: { [sepolia.id]: web() },
  storage: new UtilaVault(), // credential cache: transport keypairs + permits
  permitStorage: new UtilaVault(), // optional: dedicated vault for permits only
});

const zama = new ZamaSDK(config);
```

Because there is no `walletClient`, the SDK cannot sign anything — it only builds unsigned
payloads and, once you hand back a signature, broadcasts and tracks receipts. An ethers
setup is equivalent: pass a `new JsonRpcProvider("https://your-rpc")` to
`createConfig` from `@zama-fhe/sdk/ethers`.

The six features map to the surface as follows:

| #   | Utila ask                               | SDK surface                                                                        |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Offline signing flow                    | `zama.offline.prepare / sign / broadcast`                                          |
| 2   | View keys in your own vault (encrypted) | `config.storage` / `config.permitStorage` implementing `GenericStorage`            |
| 3   | Publish through your own RPC            | `publicClient` transport (viem) or `provider` (ethers)                             |
| 4   | Explicit view-key activation            | `prepare({ kind: "DecryptionPermit" }) → registerPermit`, or `permits.grantPermit` |
| 5   | Unbundle shield (approve + wrap)        | `wrappedToken.prepareShield()` → per-step `prepare / broadcast`                    |
| 6   | Unbundle unshield (request + finalize)  | `Unwrap` then `FinalizeUnwrap` kinds; `requestId` read from receipt (§9)           |

---

## 3. Feature 1 — Offline signing flow

Every write splits into three independently-runnable phases. `prepare` is signer-optional;
`sign` is Utila's; `broadcast` is the SDK's.

```ts
// PHASE 1 — prepare: SDK builds an RLP-encoded, unsigned EIP-1559 (type-2) transaction.
const prepared = await zama.offline.prepare({
  kind: "ConfidentialTransfer",
  from: utilaWallet,
  token: tokenAddress,
  to: recipient,
  amount: 1_000_000n, // plaintext in — SDK encrypts during prepare
});
// prepared = { kind, unsignedTx: Hex, from, to, chainId, request }

// PHASE 2 — sign out-of-band via Utila custody / MPC / policy engine.
const signedTx = await utilaCustody.signTransaction(prepared.unsignedTx);

// PHASE 3 — broadcast through your RPC, await the receipt, sync SDK caches.
const result = await zama.offline.broadcast(prepared, signedTx);
```

Two custody realities to plan around:

- **Let the SDK broadcast.** Have Utila return the signed bytes and call `broadcast` — the
  SDK then owns the tx hash (`keccak256(signedTx)`), waits for the receipt, emits the
  matching event, and syncs its caches. If Utila must broadcast the transaction itself, the
  SDK never joins the lifecycle for that submission: you own receipt-tracking and any cache
  refresh yourself.
- **Long signing ceremonies** (nonce/fees may drift before your quorum signs): the payload
  is frozen once you export it for signing — nonce and fees live inside what gets signed and
  cannot be re-stamped afterwards. Pin generous `nonce` / `maxFeePerGas` /
  `maxPriorityFeePerGas` bounds up front on `prepare` (see below) rather than expecting to
  refresh late.

`prepare` accepts an options object to pin `nonce`, `maxFeePerGas`,
`maxPriorityFeePerGas`, and `gasLimit`, skipping the RPC reads entirely — intended for
custodians that run their own nonce manager:

```ts
await zama.offline.prepare(request, { nonce: 42, maxFeePerGas: 30_000_000_000n });
```

The full set of transaction kinds (`TransactionKind`): `ConfidentialTransfer`,
`ConfidentialTransferFrom`, `SetOperator`, `Unwrap`, `UnwrapAll`, `FinalizeUnwrap`,
`ApproveUnderlying`, `Wrap`, `TransferAndCall`, `DelegateDecryption`, `RevokeDelegation`.
From Utila's side they are all just unsigned EIP-1559 transactions — the kind only affects
how the SDK builds the calldata.

---

## 4. Feature 2 — View keys stored in and retrieved from your own vault

A "view key" in this SDK is two artifacts, both persisted through the same storage
interface:

- **Transport key pair** — an ML-KEM keypair (~30-day TTL), stored under
  `keypair:{signerAddress}`. Chain-independent.
- **Permission** — a signed EIP-712 decryption permit (≤10 contracts each), stored under
  `permits:{signerAddress}:{chainId}:{delegatorAddress}`. Chain-scoped.

You supply storage by implementing `GenericStorage` and passing it as `storage` (and,
optionally, `permitStorage` to isolate permits):

```ts
class UtilaVault implements GenericStorage {
  async get<T>(key: string): Promise<T | null> {
    // fetch ciphertext from your vault, decrypt, deserialize back to the object
  }
  async set<T>(key: string, value: T): Promise<void> {
    // serialize, encrypt, persist to your vault
  }
  async delete(key: string): Promise<void> {
    // remove from your vault
  }
}
```

Two details that matter for a vault-backed implementation:

- **The SDK does not encrypt what it stores.** It hands you plaintext credential objects;
  encryption-at-rest is your responsibility inside `set` / `get`. This is exactly the seam
  that lets you keep view keys encrypted in Utila's vault.
- **The SDK stores structured objects, not JSON strings.** Your vault must round-trip types
  faithfully — encrypt the serialized form on `set`, deserialize to the object on `get`.

If you provide no storage, the defaults are IndexedDB (browser) and in-memory (Node), which
are unsuitable for custody — always pass your vault.

---

## 5. Feature 3 — Publishing transactions through your own RPC

The RPC is the transport on `publicClient` (viem) or the `provider` (ethers) from §2.
There is no separate hidden broadcaster: `offline.broadcast` calls
`provider.sendRawTransaction(signedTx)`, which is `publicClient.sendRawTransaction` → your
RPC. Reads (`eth_call`, gas estimation, `getTransactionCount("pending")`, block/receipt
reads) go through the same client.

Two nuances:

- **Reads and writes can use different endpoints.** If you ever run with an in-process viem
  `walletClient`, writes use that client's transport and reads use `publicClient`. In the
  signer-less custody pattern everything is `publicClient`, so a single RPC serves both.
- **The `network` URL on the chain preset is metadata only.** `sepolia.network` is not what
  the SDK calls for RPC — the actual endpoint is always the transport you configure. You
  can override the preset (`{ ...sepolia, network, relayerUrl, auth }`) to keep metadata
  honest, but the effective RPC is the `publicClient` transport.

---

## 6. Feature 4 — Explicit view-key activation

You do not have to wait for the first `balanceOf` / decrypt to trigger permit creation.
Activate ahead of time. In signer-less custody, activation is itself a
`prepare → sign → register` for the EIP-712 permit:

```ts
// PHASE 1 — build the EIP-712 permit envelope (no signer needed).
const preparedPermit = await zama.offline.prepare({
  kind: "DecryptionPermit",
  from: utilaWallet,
  contracts: [tokenAddress, otherContract], // ≤10 per permit; SDK chunks larger sets
});

// typedData === null → the contracts are ALREADY covered; nothing to sign.
if (preparedPermit.typedData) {
  // PHASE 2 — sign the EIP-712 typed data via Utila custody.
  const signature = await utilaCustody.signTypedData(preparedPermit.typedData);

  // PHASE 3 — persist the activated permit into your vault.
  await zama.offline.registerPermit(preparedPermit, signature);
}
```

If you ever run with an in-process signer, the online equivalents are one-liners on the
`permits` namespace — all idempotent, so calling them proactively is safe:

```ts
await zama.permits.warmTransportKeyPair(); // pre-generate the keypair, no prompt
await zama.permits.grantPermit([tokenAddress]); // activate a permit up front
const ready = await zama.permits.hasPermit([tokenAddress]); // check; never prompts
```

This fully decouples activation from `balanceOf`: once a permit is in your vault, decrypt
calls find it and proceed without a signing round-trip.

---

## 7. Feature 5 — Unbundle shield (separate approval and wrap)

`WrappedToken.prepareShield()` returns a **plan** whose `steps` are exactly the separate
transactions. Each step is one signing session:

```ts
const plan = await wrappedToken.prepareShield(1_000n, { recipient: utilaWallet });
// plan.path === "approveAndWrap", steps: [ApproveUnderlyingRequest, WrapRequest]
//   or "transferAndCall" (single tx) if the ERC-20 supports ERC-1363

for (const step of plan.steps) {
  const prepared = await zama.offline.prepare(step); // e.g. "ApproveUnderlying", then "Wrap"
  const signed = await utilaCustody.signTransaction(prepared.unsignedTx);
  await zama.offline.broadcast(prepared, signed); // each in its own session
}
```

Notes:

- The SDK selects the path (`transferAndCall` single-tx vs `approve` + `wrap`) via ERC-165
  introspection — you never branch on the token.
- `steps` can be up to three entries because a USDT-style token needs an approve-reset
  (approve-0 then approve-N). Iterate the plan; don't assume a fixed count.
- Control approval size with `approvalStrategy: "exact" | "max" | "skip"` in the
  `prepareShield` options (default `"exact"`). Use `"skip"` when a prior approval already
  covers the amount.

---

## 8. Trust boundary — decisions worth reviewing

These caveats are documented in the SDK's public API
(`packages/sdk/src/namespaces/offline.ts`) and apply to any signer-less custodian.

### 8.1 Prefer the SDK-broadcast path

If Utila broadcasts the signed transaction itself, the SDK never sees the signed bytes and
cannot bind a tx hash to `prepared.unsignedTx` — you own receipt-tracking and cache refresh
for that submission. Prefer the **broadcast** path (Utila returns signed bytes; the SDK
broadcasts and therefore knows the hash, `keccak256(signedTx)`) wherever your flow allows
it.

### 8.2 `from`-address authority is not proven (signer-less path)

With no configured signer, `request.from` is the sole declaration of which wallet signs.
The SDK skips the address-match assertion it would run with an in-process signer, and trusts
that the application points `from` at a wallet Utila controls. Verifying control of `from`
is the application's responsibility; confirm Utila rejects a signature request for an
address the credential doesn't control.

---

## 9. Feature 6 — Unbundle unshield, and the `requestId` question

Unshield is inherently two-phase, and the SDK exposes each phase as its own kind so each
gets its own signing session:

```ts
import { findUnwrapRequested } from "@zama-fhe/sdk";

// PHASE 1 — request unwrap.
const p1 = await zama.offline.prepare({
  kind: "Unwrap",
  from: utilaWallet,
  token: wrapper,
  to: utilaWallet,
  amount: 500n,
});
const r1 = await zama.offline.broadcast(p1, await utilaCustody.signTransaction(p1.unsignedTx));

// Read the requestId yourself from the receipt (as you wanted).
const event = findUnwrapRequested(r1.receipt.logs); // → { unwrapRequestId, ... }

// PHASE 2 — finalize, in a second signing session.
const p2 = await zama.offline.prepare({
  kind: "FinalizeUnwrap",
  from: utilaWallet,
  wrapper,
  unwrapRequestIdOrAmount: event.unwrapRequestId,
});
await zama.offline.broadcast(p2, await utilaCustody.signTransaction(p2.unsignedTx));
```

### On the "better" ask — deterministic `requestId` / signing both phases upfront

**This is not possible today, and it is a protocol-level constraint, not an SDK gap.** The
`unwrapRequestId` is computed _on-chain_ by the wrapper contract during the phase-1
`unwrap` transaction and only surfaced in the `UnwrapRequested` event. Because it depends on
mutable chain state:

- it **cannot be derived deterministically before** phase 1 is mined, and
- phases 1 and 2 therefore **cannot be pre-signed together** — phase 2's calldata is unknown
  until phase 1's receipt exists.

Reading the receipt (shown above via `findUnwrapRequested`) is the supported escape hatch
and matches exactly the flow Utila described. Collapsing the two legs into one atomic
transaction, or making the `requestId` pre-computable (e.g. a client-supplied salt the
contract commits to), would both require **confidential-wrapper contract changes**. If
single-session unshield is a hard requirement for Utila, we'll raise it as a protocol
feature request against the wrapper contract team — the SDK side follows trivially once the
contract exposes a deterministic id.

---

## 10. What already works

`packages/sdk/src/services/__tests__/dfns.integration.test.ts` runs the full three-phase
pipeline against **real custody (DFNS, with dashboard policy approval) + real Sepolia + the
FHEVM relayer**, for both artifact types:

1. `prepare → custody "Transaction" sign (await approval) → broadcast` — confirmed transfer.
2. `prepare → custody "Eip712" sign (await approval) → registerPermit` — confirmed permit.

The Utila integration reuses the same surface; only the custody adapter (Utila's signing API
in place of DFNS's) differs.

---

## 11. References (source of truth)

All links point to the `feature/sdk-75-deferred-signing-v2` branch, where this pipeline
lives until it merges:

- Public API + caveats: [`packages/sdk/src/namespaces/offline.ts`](https://github.com/zama-ai/token-sdk/blob/feature/sdk-75-deferred-signing-v2/packages/sdk/src/namespaces/offline.ts)
- Request / prepared types: [`packages/sdk/src/types/offline-signing.ts`](https://github.com/zama-ai/token-sdk/blob/feature/sdk-75-deferred-signing-v2/packages/sdk/src/types/offline-signing.ts)
- Storage contract (your vault): [`packages/sdk/src/types/storage.ts`](https://github.com/zama-ai/token-sdk/blob/feature/sdk-75-deferred-signing-v2/packages/sdk/src/types/storage.ts)
- Provider contract (RPC / nonce / fees / broadcast): [`packages/sdk/src/types/provider.ts`](https://github.com/zama-ai/token-sdk/blob/feature/sdk-75-deferred-signing-v2/packages/sdk/src/types/provider.ts)
- Signer contract (for the adapter alternative): [`packages/sdk/src/types/signer.ts`](https://github.com/zama-ai/token-sdk/blob/feature/sdk-75-deferred-signing-v2/packages/sdk/src/types/signer.ts)
- Permit activation namespace: [`packages/sdk/src/namespaces/permits.ts`](https://github.com/zama-ai/token-sdk/blob/feature/sdk-75-deferred-signing-v2/packages/sdk/src/namespaces/permits.ts)
- Shield plan + wrap/unwrap: [`packages/sdk/src/token/wrapped-token.ts`](https://github.com/zama-ai/token-sdk/blob/feature/sdk-75-deferred-signing-v2/packages/sdk/src/token/wrapped-token.ts)
- Unwrap event decoding (`requestId`): [`packages/sdk/src/events/onchain-events.ts`](https://github.com/zama-ai/token-sdk/blob/feature/sdk-75-deferred-signing-v2/packages/sdk/src/events/onchain-events.ts)
- Working custody integration: [`packages/sdk/src/services/__tests__/dfns.integration.test.ts`](https://github.com/zama-ai/token-sdk/blob/feature/sdk-75-deferred-signing-v2/packages/sdk/src/services/__tests__/dfns.integration.test.ts)
