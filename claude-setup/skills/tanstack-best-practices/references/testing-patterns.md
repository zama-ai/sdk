# Testing Patterns for TanStack Query Hook Libraries

## Test Infrastructure

### Deterministic Timestamps

Stabilize `Date.now()` in test setup so `dataUpdatedAt` values are predictable in snapshots:

```ts
// react test setup
vi.useFakeTimers({ now: new Date(2023, 1, 1) }); // 1675209600000
```

## Layer 1: Core Action Tests

Test raw async functions against the real backend. No TanStack Query, no React.

```ts
beforeEach(async () => {
  await testClient.mainnet.setBalance({ address, value: parseEther("10000") });
  await testClient.mainnet.mine({ blocks: 1 });
});

test("default", async () => {
  await expect(getBalance(config, { address })).resolves.toMatchInlineSnapshot(`
    { decimals: 18, symbol: "ETH", value: 10000000000000000000000n }
  `);
});
```

**What these catch:** Backend integration issues, encoding/decoding bugs, wrong return shapes.

## Layer 2: Query Options Factory Tests

Test factory output synchronously. No async, no rendering, no backend calls.

```ts
test("default", () => {
  expect(getBalanceQueryOptions(config, { address })).toMatchInlineSnapshot(`
    {
      "enabled": true,
      "queryFn": [Function],
      "queryKey": ["balance", { "address": "0x95132..." }],
    }
  `);
});
```

For mutations:

```ts
test("default", () => {
  expect(connectMutationOptions(config)).toMatchInlineSnapshot(`
    {
      "mutationFn": [Function],
      "mutationKey": ["connect"],
    }
  `);
});
```

**What these catch:** Query key regressions (wrong shape, included staleTime, missing chainId), enabled logic bugs, missing queryFn/mutationFn. Runs in milliseconds — fastest feedback loop.

## Layer 3: Hook Integration Tests

Full integration in a real browser. The core testing rhythm:

### Query Hook Pattern

```ts
beforeEach(async () => {
  // Set up deterministic backend state
  await testClient.mainnet.setBalance({ address, value: parseEther("10000") });
  await testClient.mainnet.mine({ blocks: 1 });
});

test("default", async () => {
  // 1. Render hook inside WagmiProvider + QueryClientProvider
  const { result } = await renderHook(() => useBalance({ address }));

  // 2. Wait for TanStack Query to complete
  await vi.waitUntil(() => result.current.isSuccess, { timeout: 10_000 });

  // 3. Snapshot the ENTIRE TanStack Query state
  expect(result.current).toMatchInlineSnapshot(`
    {
      "data": { "decimals": 18, "symbol": "ETH", "value": 10000000000000000000000n },
      "isSuccess": true,
      "isPending": false,
      "fetchStatus": "idle",
      "queryKey": ["balance", { "address": "0x...", "chainId": 1 }],
      ...
    }
  `);
});
```

**Why snapshot the full object:** Catches both data correctness AND TanStack Query lifecycle state (isSuccess, isPending, fetchStatus, queryKey). A single snapshot guards against many regression types.

### Testing the Enabled Transition

Verify auto-gating: disabled (missing param) -> enabled (param provided) -> data fetched.

```ts
test("address: undefined -> defined", async () => {
  let address: Address | undefined; // starts undefined

  const { result, rerender } = await renderHook(() => useBalance({ address }));

  // Query is disabled — no fetch, isPending, no data
  expect(result.current.isPending).toBe(true);
  expect(result.current.fetchStatus).toBe("idle");
  expect(result.current.data).toBeUndefined();

  address = accounts[0]; // now defined
  rerender();

  await vi.waitUntil(() => result.current.isSuccess);
  expect(result.current.data.value).toBe(10000000000000000000000n);
});
```

### Mutation Hook Pattern

```ts
test("default", async () => {
  // 1. Connect wallet first (mutations require auth)
  await connect(config, { connector });

  // 2. Render hook
  const { result } = await renderHook(() => useSendTransaction());

  // 3. Call mutate() imperatively
  result.current.mutate({ to: "0xd213...", value: parseEther("0.01") });

  // 4. Wait and assert
  await vi.waitUntil(() => result.current.isSuccess, { timeout: 10_000 });
  expect(result.current.data).toMatch(transactionHashRegex);

  // 5. Clean up
  await disconnect(config, { connector });
});
```

### Watch/Subscription Pattern

Verify push-to-pull bridge: subscription fires -> setQueryData -> hook re-renders.

```ts
test("watch: true", async () => {
  const { result } = await renderHook(() => useBlockNumber({ watch: true }));
  await vi.waitUntil(() => result.current.isSuccess);
  const initial = result.current.data!;

  // Trigger backend state change
  await testClient.mainnet.mine({ blocks: 1 });

  // Verify hook reacted via setQueryData
  await vi.waitFor(() => {
    expect(result.current.data).toEqual(initial + 1n);
  });
});
```

### Waiting Utilities

- **`vi.waitUntil(() => condition)`** — poll until truthy. Use for "wait until query succeeds."
- **`vi.waitFor(() => { expect(...) })`** — retry assertion until it passes. Use for "wait until data equals X."

Both are needed because hook updates are async (backend response -> polling -> state update -> React re-render).

## Layer 4: Type-Level Tests

`*.test-d.ts` files are type-checked at compile time. They never execute.

### Select Transform Typing

```ts
test("select data", () => {
  const result = useBalance({
    query: {
      select(data) {
        return data?.value;
      }, // Balance -> bigint
    },
  });
  expectTypeOf(result.data).toEqualTypeOf<bigint | undefined>();
});
```

Verifies that the `select` function's return type propagates through generics to the hook's return type.

### Mutation Callback Context Flow

```ts
test("context", () => {
  const { mutate } = useSendTransaction({
    mutation: {
      onMutate(variables) {
        return { foo: "bar" }; // context value
      },
      onSuccess(data, variables, context) {
        // context is guaranteed (onMutate completed before mutationFn)
        expectTypeOf(context).toEqualTypeOf<{ foo: string }>();
      },
      onError(error, variables, context) {
        // context might be undefined (onMutate could have thrown)
        expectTypeOf(context).toEqualTypeOf<{ foo: string } | undefined>();
      },
    },
  });
});
```

Tests the TanStack Query context flow: `onMutate` returns context, `onSuccess` gets it guaranteed, `onError`/`onSettled` get it as `| undefined` (because `onMutate` might have thrown before creating the context).

### What Type Tests Catch

- Generic inference breaks (user's `data` becomes `unknown` or `any`)
- `select` transform type propagation failures
- Callback parameter type regressions (context, variables, data, error)
- Invalid API usage verification (with `@ts-expect-error`)

## Custom renderHook Wrapper

The test infrastructure provides a custom `renderHook` that:

```ts
export function renderHook(hook, options) {
  queryClient.clear()                          // fresh cache per test
  return vitestRenderHook(hook, {
    wrapper: ({ children }) => (
      <WagmiProvider config={config} reconnectOnMount={false}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    ),
    ...options,
  })
}
```

Key decisions:

- `queryClient.clear()` — ensures no cache leakage between tests
- `reconnectOnMount: false` — prevents automatic reconnection from interfering with test setup
- Shared `queryClient` instance (created once, cleared per test) — avoids overhead of recreating

## Test Environment Matrix

Different packages use different test environments:

| Package | Environment           | Why                                                 |
| ------- | --------------------- | --------------------------------------------------- |
| core    | happy-dom             | Actions are framework-agnostic, don't need real DOM |
| react   | Playwright (Chromium) | Hooks need real browser rendering                   |
| vue     | happy-dom             | Vue's test utils work well with happy-dom           |
| solid   | Playwright (Chromium) | SolidJS reactivity needs real browser               |
| cli     | Node                  | CLI tool, no DOM needed                             |

React and Solid use real browsers via Playwright because their reactivity models (React's reconciler, Solid's fine-grained signals) are best tested in real browser environments.
