---
title: Query keys
description: Reference for the zamaQueryKeys factory used for manual React Query cache control.
---

# Query keys

The `zamaQueryKeys` object is a factory for React Query cache keys. Use it to invalidate, prefetch, or remove cached data manually.

Mutations auto-invalidate related caches, so you only need `zamaQueryKeys` for advanced cache control.

## Import

```ts
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
```

## Usage

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { invalidateBalanceQueries, zamaQueryKeys } from "@zama-fhe/sdk/query";

const queryClient = useQueryClient();

// Recommended: invalidate a token's balance across BOTH balance namespaces
// (single-token and batched) in one call.
invalidateBalanceQueries(queryClient, "0xToken");

// Lower-level: raw key factories for finer targeting.
queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalance.token("0xToken") });
queryClient.invalidateQueries({
  queryKey: zamaQueryKeys.confidentialBalance.owner("0xToken", "0xOwner"),
});
```

{% hint style="warning" %}
`confidentialBalance` (single-token) and `confidentialBalances` (batched, multi-token) are **disjoint** root namespaces with no shared prefix, so invalidating one never touches the other. `useConfidentialBalance` writes to the first and the batched `useConfidentialBalances` to the second — a manual `invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalance.all })` silently leaves every batched entry stale. Prefer [`invalidateBalanceQueries`](#invalidatebalancequeries), which invalidates both.
{% endhint %}

## Key factories

### `zamaQueryKeys.confidentialBalance`

Single-token decrypted balance.

| Key                   | Scope                             |
| --------------------- | --------------------------------- |
| `.all`                | All decrypted balances            |
| `.token(addr)`        | All balances for one token        |
| `.owner(addr, owner)` | One owner's balance for one token |

### `zamaQueryKeys.confidentialBalances`

Multi-token batch balances.

| Key                     | Scope                                     |
| ----------------------- | ----------------------------------------- |
| `.all`                  | All batch balance queries                 |
| `.tokens(addrs, owner)` | Batch query for specific tokens and owner |

### `invalidateBalanceQueries`

Because the two balance namespaces above are disjoint, invalidating a token's balance correctly means hitting both. `invalidateBalanceQueries` does exactly that — invalidate a token in `confidentialBalance` and refetch every batched `confidentialBalances` query — so callers don't have to compose two keys and risk dropping half the cache. This is the same helper the SDK's own mutations use to auto-invalidate after a shield, transfer, or unshield.

```ts
import { invalidateBalanceQueries } from "@zama-fhe/sdk/query";

invalidateBalanceQueries(queryClient, "0xToken");
```

### `zamaQueryKeys.hasPermit`

Permit coverage status.

| Key    | Scope                   |
| ------ | ----------------------- |
| `.all` | All `hasPermit` queries |

### `zamaQueryKeys.underlyingAllowance`

ERC-20 allowance of the underlying token for the wrapper.

| Key                   | Scope                                      |
| --------------------- | ------------------------------------------ |
| `.all`                | All allowance queries                      |
| `.token(addr)`        | Allowances for one token                   |
| `.scope(addr, owner)` | Specific owner's allowance for the wrapper |

### `zamaQueryKeys.wrappersRegistry`

On-chain wrappers registry queries.

| Key                                                         | Scope                                      |
| ----------------------------------------------------------- | ------------------------------------------ |
| `.all`                                                      | All registry queries                       |
| `.chainId()`                                                | Chain ID resolution                        |
| `.tokenPairs(registryAddr)`                                 | All pairs for a registry                   |
| `.tokenPairsLength(registryAddr)`                           | Pair count                                 |
| `.tokenPairsSlice(registryAddr, from, to)`                  | Index-based slice                          |
| `.tokenPair(registryAddr, index)`                           | Single pair by index                       |
| `.confidentialTokenAddress(registryAddr, tokenAddr)`        | Forward lookup (plain &rarr; confidential) |
| `.tokenAddress(registryAddr, confidentialAddr)`             | Reverse lookup (confidential &rarr; plain) |
| `.isConfidentialTokenValid(registryAddr, confidentialAddr)` | Validity check                             |
| `.listPairs(registryAddr, page, pageSize, metadata)`        | Paginated listing                          |

### `zamaQueryKeys.decryption`

Cached decrypted values. Populated by [`useDecryptValues`](./useDecryptValues.md).

```ts
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
```

| Key                                                   | Scope                                          |
| ----------------------------------------------------- | ---------------------------------------------- |
| `.encryptedValue(encryptedValue, contractAddress?)`   | Single clear value by encrypted value          |
| `.encryptedInputs(encryptedInputs[], walletAccount?)` | Multiple clear values by encrypted-input array |

## Common patterns

### Invalidate after an external transaction

```tsx
import { invalidateBalanceQueries } from "@zama-fhe/sdk/query";

// After a transfer made outside the SDK — refreshes both balance namespaces
invalidateBalanceQueries(queryClient, "0xToken");
```

### Prefetch balances on hover

```tsx
queryClient.prefetchQuery({
  queryKey: zamaQueryKeys.confidentialBalance.owner("0xToken", "0xOwner"),
  queryFn: () => fetchBalance("0xToken", "0xOwner"),
});
```

### Clear all cached data on disconnect

Use `invalidateWalletLifecycleQueries` — it removes wallet-local caches (decrypted values, permits) and invalidates every Zama query across all namespaces, so a stale entitlement can't leak across accounts. Hand-composing `removeQueries` on a single balance namespace would miss the batched balances, permits, and decryption caches.

```tsx
import { invalidateWalletLifecycleQueries } from "@zama-fhe/sdk/query";

invalidateWalletLifecycleQueries(queryClient);
```

## Related

- [ZamaProvider](./ZamaProvider.md) — provider setup and hook overview
- [`useConfidentialBalance`](./useConfidentialBalance.md) — the hook whose cache these keys control
