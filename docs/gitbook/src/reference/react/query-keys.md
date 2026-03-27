---
title: Query Keys
description: Reference for the zamaQueryKeys factory used for manual React Query cache control.
---

# Query Keys

The `zamaQueryKeys` object is a factory for React Query cache keys. Use it to invalidate, prefetch, or remove cached data manually.

Mutations auto-invalidate related caches, so you only need `zamaQueryKeys` for advanced cache control.

## Import

```ts
import { zamaQueryKeys } from "@zama-fhe/react-sdk";
```

## Usage

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { zamaQueryKeys } from "@zama-fhe/react-sdk";

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

## Key Factories

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

### `zamaQueryKeys.confidentialHandle`

Single-token encrypted handle (pre-decryption).

| Key                   | Scope                            |
| --------------------- | -------------------------------- |
| `.all`                | All handles                      |
| `.token(addr)`        | Handles for one token            |
| `.owner(addr, owner)` | One owner's handle for one token |

### `zamaQueryKeys.confidentialHandles`

Multi-token batch handles.

| Key                     | Scope                                     |
| ----------------------- | ----------------------------------------- |
| `.all`                  | All batch handle queries                  |
| `.tokens(addrs, owner)` | Batch query for specific tokens and owner |

### `zamaQueryKeys.decryption`

User decryption queries (used by `useUserDecrypt`).

| Key                          | Scope                                        |
| ---------------------------- | -------------------------------------------- |
| `.all`                       | All decryption queries                       |
| `.handle(handle, contract?)` | Single handle (used internally by the cache) |
| `.batch(handles[], account)` | Batch decrypt for a specific requester       |

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

### `zamaQueryKeys.activityFeed`

Classified activity feed.

| Key                                           | Scope                   |
| --------------------------------------------- | ----------------------- |
| `.all`                                        | All feed queries        |
| `.token(addr)`                                | Feed for one token      |
| `.scope(addr, userAddress, logsKey, decrypt)` | Fully scoped feed query |

### `zamaQueryKeys.fees`

Fee queries.

| Key                                             | Scope                 |
| ----------------------------------------------- | --------------------- |
| `.shieldFee(feeManager, amount?, from?, to?)`   | Shield fee estimate   |
| `.unshieldFee(feeManager, amount?, from?, to?)` | Unshield fee estimate |
| `.batchTransferFee(feeManager)`                 | Batch transfer fee    |
| `.feeRecipient(feeManager)`                     | Fee recipient address |

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

## Common Patterns

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
queryClient.removeQueries({ queryKey: zamaQueryKeys.confidentialHandle.all });
queryClient.removeQueries({ queryKey: zamaQueryKeys.decryption.all });
```

## Related

- [ZamaProvider](/reference/react/ZamaProvider) — provider setup and hook overview
- [`useConfidentialBalance`](/reference/react/useConfidentialBalance) — the hook whose cache these keys control
