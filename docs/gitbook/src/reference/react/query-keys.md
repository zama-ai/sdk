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
import { zamaQueryKeys } from "@zama-fhe/sdk/query";

const queryClient = useQueryClient();

// Invalidate all balances
queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalance.all });

// Invalidate one token's balances
queryClient.invalidateQueries({
  queryKey: zamaQueryKeys.confidentialBalance.token("0xToken"),
});

// Invalidate a specific owner's balance
queryClient.invalidateQueries({
  queryKey: zamaQueryKeys.confidentialBalance.owner("0xToken", "0xOwner"),
});
```

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

### `zamaQueryKeys.isAllowed`

Session signature status.

| Key    | Scope                       |
| ------ | --------------------------- |
| `.all` | All session-allowed queries |

### `zamaQueryKeys.underlyingAllowance`

ERC-20 allowance of the underlying token for the wrapper.

| Key                            | Scope                       |
| ------------------------------ | --------------------------- |
| `.all`                         | All allowance queries       |
| `.token(addr)`                 | Allowances for one token    |
| `.scope(addr, owner, wrapper)` | Specific owner-wrapper pair |

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

Cached decrypted values. Populated by [`useUserDecrypt`](/reference/react/useUserDecrypt).

```ts
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
```

| Key                                  | Scope                                       |
| ------------------------------------ | ------------------------------------------- |
| `.handle(handle, contractAddress?)`  | Single decrypted value by handle            |
| `.handles(handles[])`               | Multiple decrypted values by handle array   |

## Common patterns

### Invalidate after an external transaction

```tsx
// After a transfer made outside the SDK
queryClient.invalidateQueries({
  queryKey: zamaQueryKeys.confidentialBalance.token("0xToken"),
});
```

### Prefetch balances on hover

```tsx
queryClient.prefetchQuery({
  queryKey: zamaQueryKeys.confidentialBalance.owner("0xToken", "0xOwner"),
  queryFn: () => fetchBalance("0xToken", "0xOwner"),
});
```

### Clear all cached data on disconnect

```tsx
queryClient.removeQueries({ queryKey: zamaQueryKeys.confidentialBalance.all });
```

## Related

- [ZamaProvider](/reference/react/ZamaProvider) — provider setup and hook overview
- [`useConfidentialBalance`](/reference/react/useConfidentialBalance) — the hook whose cache these keys control
