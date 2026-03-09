---
title: Two-Phase Balance Polling
description: How the SDK uses smart polling to minimize expensive FHE decryption while keeping balances up to date.
---

# Two-Phase Balance Polling

FHE decryption is expensive. Each decrypt requires a round-trip to the relayer KMS, re-encryption under the user's public key, and local WASM decryption. This takes 2-5 seconds per balance. Polling the decrypted balance every few seconds would overwhelm the relayer and create a poor user experience.

The SDK solves this with a two-phase polling architecture that separates the cheap "has anything changed?" check from the expensive "what is the new value?" decryption.

## The problem with naive polling

A naive approach polls the decrypted balance at a fixed interval:

```
Every 10s: read encrypted handle → send to relayer → KMS re-encrypts → WASM decrypts → display
```

This is wasteful. Most polls return the same value. If a user's balance changes once per hour, 359 out of 360 polls perform an expensive decryption for no reason.

The cost compounds with multiple tokens. A portfolio page showing 10 token balances would fire 10 decrypt operations every 10 seconds — 60 relayer round-trips per minute — even when nothing has changed.

## The two-phase solution

### Phase 1: Poll the encrypted handle (cheap)

The SDK reads the encrypted handle from the contract via a standard RPC call every 10 seconds (configurable). This is a normal `eth_call` to `confidentialBalanceOf` — no FHE, no relayer, no wallet signature. It costs the same as reading any public view function.

```
Every 10s: readContract(confidentialBalanceOf) → bytes32 handle
```

The handle is a `bytes32` identifier pointing to an FHE ciphertext on-chain. It changes whenever the underlying encrypted value changes — after a transfer, shield, or unshield.

### Phase 2: Decrypt when the handle changes (expensive)

The SDK compares the newly polled handle to the previously known handle. If they differ, the balance has changed and decryption is necessary. If they match, the cached plaintext value is still correct.

```
Handle changed?
    │
    ├── No  → return cached balance (free)
    │
    └── Yes → decrypt via relayer (2-5 seconds) → cache result → return new balance
```

This means the expensive decryption runs only when a balance actually changes — typically after a user's own transaction or an incoming transfer.

## Flow diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Phase 1 (cheap)                     │
│                                                         │
│   Poll encrypted handle via RPC every 10 seconds        │
│   ┌──────────┐    ┌───────────┐    ┌────────────────┐   │
│   │ setTimer  │───▶│ readContract│───▶│ compare handle │  │
│   │ (10s)    │    │ (eth_call) │    │ to last known  │   │
│   └──────────┘    └───────────┘    └───────┬────────┘   │
│                                            │            │
└────────────────────────────────────────────┼────────────┘
                                             │
                              ┌──────────────┴──────────────┐
                              │                             │
                         Handle same                   Handle changed
                              │                             │
                              ▼                             ▼
                    Return cached balance     ┌─────────────────────────┐
                    (no network call)         │     Phase 2 (expensive)  │
                                              │                         │
                                              │  Send to relayer KMS    │
                                              │  KMS re-encrypts        │
                                              │  WASM decrypts locally  │
                                              │  Cache new plaintext    │
                                              │                         │
                                              └─────────────────────────┘
```

## How caching works

The balance cache is keyed by three components:

```
["zama.confidentialBalance", { tokenAddress, owner, handle }]
```

- **tokenAddress** — the confidential token contract.
- **owner** — the wallet address whose balance is being read.
- **handle** — the encrypted handle returned from the contract.

When the handle changes, the query key changes. React Query (or TanStack Query) treats this as a new query, triggering a fresh `queryFn` execution — the decrypt call. The old cache entry (with the previous handle) becomes stale and is eventually garbage-collected.

The decrypt query uses `staleTime: Infinity`. Once a balance is decrypted for a given handle, it is never re-fetched. This is safe because a handle uniquely identifies a ciphertext. If the ciphertext changes, the handle changes, and a new query fires.

::: info
The handle query uses `staleTime` defaults (0 by default), so it refetches on mount and at the polling interval. The balance query uses `staleTime: Infinity`, so it only runs when the handle in its query key changes.
:::

## Mutation-triggered invalidation

When you call a mutation hook — `useConfidentialTransfer`, `useShield`, or `useUnshield` — the SDK automatically invalidates the handle query cache on transaction success. This triggers an immediate Phase 1 poll, which detects the new handle and kicks off Phase 2 decryption.

```
User calls shield(1000n)
        │
        ▼
Transaction confirmed
        │
        ▼
SDK invalidates handle query cache
        │
        ▼
Phase 1 fires immediately → detects new handle
        │
        ▼
Phase 2 decrypts new balance
        │
        ▼
UI updates
```

This means balance updates appear within seconds of a confirmed transaction, without waiting for the next polling interval.

::: warning
If you interact with the confidential token contract directly (bypassing SDK mutation hooks), the SDK will not know to invalidate the cache. In that case, manually invalidate the handle query:

```ts
queryClient.invalidateQueries({
  queryKey: zamaQueryKeys.confidentialHandle.token("0xToken"),
});
```

:::

## Configuration

### Polling interval

The default handle polling interval is 10 seconds. Override it per hook:

```tsx
const { data: balance } = useConfidentialBalance({
  tokenAddress: "0xToken",
  handleRefetchInterval: 5000, // poll every 5 seconds
});
```

Shorter intervals detect changes faster at the cost of more RPC calls. Since Phase 1 is a standard `eth_call`, the cost is low — but consider your RPC provider's rate limits.

### Disabling polling

Set `handleRefetchInterval` to `false` to disable automatic polling entirely. The handle is fetched once and only re-fetched on manual invalidation or component remount.

## Multi-token polling

The `useConfidentialBalances` hook applies the same two-phase strategy to multiple tokens in a single hook call. It polls all handles together and decrypts only the ones that changed.

```
Poll handles for [TokenA, TokenB, TokenC]
        │
        ▼
TokenA: same handle → skip
TokenB: new handle  → decrypt
TokenC: same handle → skip
```

This is more efficient than mounting separate `useConfidentialBalance` hooks for each token, because the batch hook can coordinate polling and decryption.

## Why this architecture matters

| Approach                          | RPC calls/min (10 tokens) | Relayer calls/min (10 tokens) | Latency on change    |
| --------------------------------- | ------------------------- | ----------------------------- | -------------------- |
| Naive polling (10s)               | 60                        | 60                            | ~10s (poll interval) |
| Two-phase polling (10s)           | 60                        | 0-2 (only on change)          | ~10s + decrypt time  |
| Two-phase + mutation invalidation | 60                        | 0-2 (only on change)          | ~2-5s (immediate)    |

The RPC cost is the same in both approaches — you need to check the chain regardless. The difference is in relayer calls. Two-phase polling reduces relayer load by 95%+ in typical usage, where balances change infrequently relative to the polling interval.

The mutation-triggered invalidation further improves perceived latency for the user's own transactions, since the update path bypasses the polling interval entirely.

## Implementation details

The two-phase architecture is built on React Query's primitives:

- **Phase 1** uses `confidentialHandleQueryOptions` with `refetchInterval` set to the polling interval.
- **Phase 2** uses `confidentialBalanceQueryOptions` with `staleTime: Infinity` and the handle embedded in the query key.
- Phase 2's `enabled` flag depends on Phase 1 having a non-zero handle and an owner address.

The core SDK exposes these as query option factories so they work with any React Query setup. The React SDK's `useConfidentialBalance` hook composes them into a single declarative API.

See the [React SDK hooks guide](/reference/react/query-keys) for usage examples. For the query key structure, see the [`zamaQueryKeys` reference](/reference/react/query-keys).
