---
title: Permit model
description: How EIP-712 signed permits authorize FHE decryption for specific contracts.
---

# Permit model

Decrypting an on-chain FHE ciphertext requires two things: a transport key pair (generated once, stored persistently — see [Security Model](./security-model.md#credential-storage)) and a **signed permit** that authorizes decryption for specific contract addresses. This page explains how permits work.

## What is a permit

A permit is an EIP-712 typed data signature from the user's wallet. It binds:

- A set of **contract addresses** (up to 10 per permit).
- A **chain ID**.
- A **start timestamp** and **duration** (derived from `permitTTL`).
- The **signer address**.
- An optional **delegator address** (for delegated decryption).

The relayer verifies this signature before re-encrypting any ciphertext. Without a valid permit covering the target contract, the relayer rejects the request.

## Key properties

- **Immutable** — the signed contract addresses are part of the EIP-712 payload and cannot be edited after signing.
- **Chunked** — each permit covers at most 10 contracts. When more are needed, the SDK chunks the addresses and requests one wallet signature per chunk.
- **Chain-scoped** — stored under `(signerAddress, chainId, delegatorAddress)`, so permits on Sepolia never collide with permits on Mainnet, and direct permits never collide with delegated ones.
- **Additive** — calling `permits.grantPermit()` with new contracts signs additional permits for the uncovered subset only. Existing permits remain valid and are not re-signed.
- **Time-bounded** — each permit records its creation timestamp and duration. Expired permits are pruned on next access.

## Lifecycle

### First visit

1. User connects wallet.
2. App calls `permits.grantPermit([contractA, contractB])`.
3. SDK checks storage — no permits cover these contracts yet.
4. SDK builds EIP-712 typed data (contract addresses, timestamp, duration) and requests a wallet signature.
5. Wallet signs → permit is stored (keyed by signer address, chain ID, and delegator).
6. Ready — subsequent decrypts reuse the stored permit silently.

### Returning visit

1. Page loads → SDK reads permits from storage.
2. Permits cover the requested contracts and haven't expired.
3. Ready — no wallet popup.

### New contract coverage

1. Decrypt request arrives for a contract not covered by existing permits.
2. SDK signs a new permit for the uncovered contracts only.
3. New permit is appended alongside existing ones — nothing is invalidated.

### Expiration

1. A permit's duration elapses (default: 30 days, configurable via `permitTTL`).
2. Permit is pruned from storage on next access.
3. The next decrypt for that contract set prompts a single wallet re-sign.
4. The transport key pair is not affected.

{% hint style="info" %}
Each permit records its start timestamp and duration at creation time. Changing `permitTTL` between sessions does not retroactively alter existing permits — they use their original duration.
{% endhint %}

## How additive permits work

Unlike a session model where re-authorizing replaces the previous authorization, permits are purely additive:

```ts
// Signs permits for all three contracts
await sdk.permits.grantPermit(["0xContractA", "0xContractB", "0xContractC"]);

// ContractA is already covered — only ContractD triggers a new signature
await sdk.permits.grantPermit(["0xContractA", "0xContractD"]);
```

This means users see fewer wallet popups over time. As they interact with more contracts, their permit coverage grows without invalidating earlier permits.

{% hint style="info" %}
Batch all contract addresses you expect to need into a single `permits.grantPermit()` call to minimize wallet popups. Each uncovered chunk of up to 10 contracts triggers one signature prompt.
{% endhint %}

## Wildcard (V2) permits

Everything above describes the V1 permit model: a bounded, explicit list of up to 10 contract addresses per permit. `@zama-fhe/sdk` also supports V2 (unified) permits, which add one capability on top of that model: a **wildcard permit**, requested by passing the exported `WILDCARD_PERMIT` sentinel instead of a contract list —

```ts
import { WILDCARD_PERMIT } from "@zama-fhe/sdk";

await sdk.permits.grantPermit(WILDCARD_PERMIT);
```

A wildcard permit covers every contract the signer is allowed to decrypt from, present and future, with a single wallet signature — including contracts the app doesn't know about yet at grant time. It's the same additive/reuse model as a normal permit: granting it again, or requesting decryption for any contract while a valid wildcard permit is in scope, never re-prompts.

The SDK prefers V2 (unified) permits by default, wildcard or not: even a plain, bounded contract list signs a V2 permit once the connected chain supports it, falling back to V1 transparently on a chain that hasn't upgraded yet. `WILDCARD_PERMIT` only controls the _wildcard scope_ on top of that — whether the permit's contract list is empty (covers everything) or the specific addresses requested.

A few things a wildcard permit does **not** change:

- **On-chain delegation is unaffected.** A wildcard permit only removes the need to enumerate contracts in the _permit_ — it has no bearing on `FHE.delegateUserDecryption()` grants, which remain required per-contract (or via a separate wildcard delegation on the ACL contract) for delegated decryption to work at all. Permit coverage and ACL delegation are two independent mechanisms.
- **Wildcard scope is opt-in, not inferred.** The SDK never signs a wildcard-scoped permit unless the caller explicitly asks for one — passing a large contract list to `grantPermit()` still signs a permit for exactly those contracts, never widened to "everything".
- **It's broader, so treat it with more care than a contract-scoped permit.** A wildcard permit signed with a long validity window is a standing grant to decrypt anything the signer owns until it expires — prefer a specific contract list unless your app genuinely needs unbounded coverage, and prefer a short `permitTTL` when you do use it.

## Revocation

Permits can be removed in two ways:

- **Selective** — `sdk.permits.revokePermits(["0xTokenA"])` removes permits touching those contracts on the current chain. Other permits are untouched — except a wildcard permit, which is always removed by a selective revoke, since it covers every contract by definition.
- **Full wipe** — `sdk.permits.revokePermits()` removes all permits for the current signer across all chains and delegators. The transport key pair is not affected.

For a complete "log out" that also removes the transport key pair, use `sdk.permits.clear()`. See the [ZamaSDK reference](../reference/sdk/ZamaSDK.md#permits-revokepermits) for the full API.

### Two revocation tiers with a shared scope

Both `revokePermits()` and `clear()` are **signer-level**: they only ever act on the calling signer's own permits (and, for `clear()`, that signer's own key-pair slot). This holds even when `transportKeyPairScope` is configured — an end-user disconnecting never invalidates other signers sharing the scope's key pair, because the shared key pair was never stored under any individual signer's slot to begin with.

Invalidating the _shared_ key pair is a separate, operator-level operation: `sdk.permits.revokeTransportKeyPair(scopeId)`. It deletes the scope's key pair — no permit needs to be touched directly, and no wallet needs to be connected. `hasPermit`/`grantPermit` then treat every permit in the scope as stale on next access, though not via one single mechanism: immediately after the revoke, `hasPermit()` returns `false` because there's no stored key pair left to compare against; once some later caller regenerates a key for the scope, it's the newly-mismatched embedded public key that `pruneUnusable` then filters existing permits on. Same end-user-visible outcome either way. Unlike other credential-store writes, this call is not best-effort: a storage failure rejects rather than being logged and swallowed, since a resolved promise here is expected to mean the key pair is actually gone — the primitive an operator reaches for on suspected compromise. This only stops the SDK from reissuing or reusing the key going forward; it does not revoke any permit already issued under it, which stays independently valid until its own `permitTTL` expiry — see [Security Model](./security-model.md#shared-tenant-scope-b2b2c-waas-operators) for the full explanation and when a shared scope makes sense.

## Wallet account changes

The SDK automatically manages permits when the wallet state changes:

| Event                 | Effect on permits                                                                 |
| --------------------- | --------------------------------------------------------------------------------- |
| **Disconnect / lock** | All permits and transport key pair cleared for the previous account               |
| **Account switch**    | Previous account's permits cleared; new account starts fresh                      |
| **Chain switch**      | Permits are chain-scoped, so existing permits on the previous chain remain intact |

See [ZamaSDK.onWalletAccountChange](../reference/sdk/ZamaSDK.md#onwalletaccountchange) for programmatic access to these transitions.

## Offline permits

The lifecycle above assumes a connected wallet signs `grantPermit`'s EIP-712 message in-process. Custody partners — HSMs, policy engines, out-of-process signers — cannot do that: `sdk.offline.preparePermit` builds the same EIP-712 typed data without signing it, and `sdk.permits.registerPermit` verifies and persists the signature once the custodian returns it. See the [Offline signing guide](../guides/offline.md#offline-permits) for the workflow.

`preparePermit` follows the same [version-selection policy](#wildcard-v2-permits) as `grantPermit` — it prefers V2 whenever the connected chain supports it, and `WILDCARD_PERMIT` requests a wildcard-scoped permit either way. See [Offline wildcard (V2) permits](../guides/offline.md#offline-wildcard-v2-permits) for the offline-specific detail: V2 delegation isn't part of the signed message, so a delegated request carries it on the prepared payload instead.

## Related

- [Security Model](./security-model.md) — transport key pair storage, threat model, and trust assumptions
- [Configuration](../guides/configuration.md#5-optional-configure-ttls-and-event-listener) — `transportKeyPairTTL` and `permitTTL` settings
- [ZamaSDK](../reference/sdk/ZamaSDK.md) — `permits.grantPermit()`, `permits.revokePermits()`, `permits.clear()` API
