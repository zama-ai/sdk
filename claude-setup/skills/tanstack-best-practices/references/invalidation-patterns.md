# Cache Invalidation Patterns

Five mechanisms for keeping cached data in sync. Choose based on the semantic meaning of the state change.

## 1. Key Change (Automatic)

When reactive state (from context or external store) flows into query keys, cache invalidation is automatic — no explicit invalidation code needed.

```ts
function useBalance(parameters) {
  const chainId = useChainId(); // reactive — re-renders when user switches chain
  const options = getBalanceQueryOptions(config, {
    ...parameters,
    chainId: parameters.chainId ?? chainId,
  });
  return useQuery(options);
}
```

User switches chain 1 to 10:

1. `useChainId` returns 10 (zustand store updated, useSyncExternalStore fired)
2. Query key becomes `['balance', { address, chainId: 10 }]`
3. TanStack Query sees a new key: cache miss, fetches balance on new chain
4. Old `['balance', { address, chainId: 1 }]` stays cached for `gcTime`
5. If user switches back within `gcTime`: instant cached data (+ background refetch if stale)

**Use when:** The changed parameter is already part of the query key. This is the most common and cleanest pattern.

**Why it works:** Because params are in the key, any param change naturally produces a different cache entry. TanStack Query handles the rest.

## 2. setQueryData (Push Real-Time Data)

Bridge push-based subscriptions (WebSocket, polling) into TanStack Query's pull-based cache.

```ts
function useBlockNumber(parameters) {
  const options = getBlockNumberQueryOptions(config, { ... })
  const queryClient = useQueryClient()

  useWatchBlockNumber({
    enabled: Boolean(watch),
    onBlockNumber(blockNumber) {
      queryClient.setQueryData(options.queryKey, blockNumber)  // direct cache write
    },
  })

  return useQuery(options)  // reads from cache
}
```

**Use when:** Streaming data arrives outside TanStack Query (WebSocket, SSE, polling callbacks). The subscription already has the data — calling `invalidateQueries` would trigger a redundant refetch.

**Why not just use the subscription directly?** Without TanStack Query:

- No deduplication (5 components = 5 subscriptions)
- No cache (navigate away and back = loading spinner)
- No stale-while-revalidate
- Manual re-render management

With `setQueryData`: all components sharing the query key re-render. Cache stays consistent. Initial data comes from the query's `queryFn`, then the subscription keeps it updated.

## 3. invalidateQueries (Mark Stale + Refetch)

Mark cache entries as stale and trigger background refetch for mounted queries.

```ts
const queryClient = useQueryClient();
const { mutate } = useSendTransaction({
  mutation: {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
  },
});
```

**Use when:** Cached data may be outdated after a write operation, or after an external state change where the data is still fetchable.

**Behavior:**

- Marks all matching queries as stale
- Mounted queries immediately refetch in the background
- Components see old data instantly, then re-render with fresh data (stale-while-revalidate UX)

### Granular Invalidation

TanStack Query matches query keys **by prefix**:

```ts
// Invalidate ALL balance queries (any address, any chain)
queryClient.invalidateQueries({ queryKey: ["balance"] });

// Invalidate balance for specific address on any chain
queryClient.invalidateQueries({ queryKey: ["balance", { address: "0xabc" }] });
```

`['balance']` matches `['balance', { address: '0xabc', chainId: 1 }]` because it's a prefix match. This is why the `[label, params]` key shape is useful — invalidating by label hits all variants.

## 4. removeQueries (Delete Cache Entry)

Delete cache entries entirely when the data source is gone.

```ts
function useConnectorClient(parameters) {
  const { address } = useConnection({ config });
  const addressRef = useRef(address);
  const queryClient = useQueryClient();

  useEffect(() => {
    const prev = addressRef.current;
    if (!address && prev) {
      // Disconnected: no valid data to fetch anymore
      queryClient.removeQueries({ queryKey: options.queryKey });
      addressRef.current = undefined;
    } else if (address !== prev) {
      // Account changed: data is stale but still fetchable
      queryClient.invalidateQueries({ queryKey: options.queryKey });
      addressRef.current = address;
    }
  }, [address, queryClient]);

  return useQuery(options);
}
```

**Use when:** The data source is gone (user disconnected, session expired, resource deleted).

**Why not `invalidateQueries`?** Invalidation triggers a background refetch. If the data source is gone (no wallet connected), that refetch would fail, putting the query into an error state. `removeQueries` deletes the entry entirely — the query returns to its initial idle state (no data, no error), which is the correct UI for "not connected."

### Decision Table

| Scenario                 | Operation           | Rationale                                     |
| ------------------------ | ------------------- | --------------------------------------------- |
| Wallet disconnected      | `removeQueries`     | No wallet = refetch would fail with error     |
| Account changed          | `invalidateQueries` | Wallet still connected, fetch for new account |
| Transaction sent         | `invalidateQueries` | Balance stale but still fetchable             |
| Session expired          | `removeQueries`     | Auth gone, refetch would 401                  |
| Token added to watchlist | `invalidateQueries` | New data to fetch, source is valid            |
| User logs out            | `removeQueries`     | User data should be cleared, not refetched    |

### Tracking Previous State with useRef

React doesn't provide the previous value of a prop. Use `useRef` to store the previous value across renders and detect transitions (connected -> disconnected, address A -> address B):

```ts
const addressRef = useRef(address);
useEffect(() => {
  const prev = addressRef.current;
  // ... compare prev vs current
  addressRef.current = address;
}, [address]);
```

## 5. structuralSharing (Prevent Unnecessary Re-Renders)

When refetched data is deeply equal to cached data, preserve the old reference to avoid re-renders.

```ts
export function readContractQueryOptions(config, options) {
  return {
    ...options.query,
    queryFn: async (context) => { ... },
    queryKey: readContractQueryKey(options),
    structuralSharing: (oldData, newData) => replaceEqualDeep(oldData, newData),
  }
}
```

`replaceEqualDeep` recursively walks old and new data. If a sub-object hasn't changed, it keeps the old reference. React components using memo/useMemo/useEffect deps with referential equality checks don't re-render.

**Use when:** Queries return complex nested objects that are frequently refetched but rarely change (common with contract state reads).

**When to skip:** Simple scalar queries (block number, balance) where the default TanStack Query behavior suffices.

## Mutation Callback Levels

TanStack Query supports callbacks at two levels. Both fire: hook-level first, then call-site.

```tsx
// Hook level: runs for EVERY invocation of this mutation
const { mutate } = useSendTransaction({
  mutation: {
    onSuccess: (data) => {
      // Cache management — always invalidate balance after any send
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
  },
});

// Call-site level: runs for THIS specific invocation only
mutate(variables, {
  onSuccess: (data) => {
    toast("Transaction sent!"); // one-off UI feedback
  },
});
```

**Guideline:** Use hook-level for cache management (invalidation, optimistic updates). Use call-site for UI feedback (toasts, navigation, one-off side effects).

## Mutation State Cleanup

Mutation state (`data`, `error`, `status`) persists after completion. Reset it when the context that produced it becomes invalid:

```ts
function useConnect(parameters) {
  const mutation = useMutation(connectMutationOptions(config, parameters));

  useEffect(() => {
    return config.subscribe(
      ({ status }) => status,
      (status, prev) => {
        if (prev === "connected" && status === "disconnected") mutation.reset(); // clear stale "connected to MetaMask" data
      },
    );
  }, [config, mutation.reset]);

  return mutation;
}
```

**Why:** Without `reset()`, after disconnect the mutation would still show `data: { accounts: ['0xabc'] }` from the previous connection — stale and misleading.

**Pattern:** Subscribe to external state changes that invalidate the mutation's meaning. Call `mutation.reset()` to return to idle state.
