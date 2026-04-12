# relayer() Transport Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `relayer()` helper function and wagmi network inference to simplify per-chain transport configuration in `createZamaConfig`.

**Architecture:** A `relayer()` function returns a `Partial<ExtendedFhevmInstanceConfig>` with `relayerUrl` set. The wagmi path in `resolveTransports` extracts the RPC URL from `wagmiConfig._internal.transports[chainId]` and merges it between `DefaultConfigs` and user overrides. No new files — `relayer()` lives in `config.ts` and is re-exported.

**Tech Stack:** TypeScript, vitest, wagmi internals (`_internal.transports`), viem `Transport` type

---

### Task 1: Add `relayer()` helper and test it

**Files:**

- Modify: `packages/react-sdk/src/config.ts`
- Modify: `packages/react-sdk/src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/react-sdk/src/__tests__/config.test.ts`, inside the top-level `describe("createZamaConfig")`:

```ts
describe("relayer() helper", () => {
  it("returns relayerUrl in a partial config", () => {
    const result = relayer("/api/relayer/11155111");
    expect(result).toEqual({ relayerUrl: "/api/relayer/11155111" });
  });

  it("merges overrides on top of relayerUrl", () => {
    const result = relayer("/api/relayer/11155111", {
      network: "https://custom-rpc.com",
    });
    expect(result).toEqual({
      relayerUrl: "/api/relayer/11155111",
      network: "https://custom-rpc.com",
    });
  });

  it("override can replace relayerUrl", () => {
    const result = relayer("/api/relayer/11155111", {
      relayerUrl: "https://override.com",
    });
    expect(result).toEqual({ relayerUrl: "https://override.com" });
  });
});
```

Update the import at the top of the test file:

```ts
import { createZamaConfig, relayer } from "../config";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --project react-sdk -- config.test.ts -t "relayer() helper" -v`
Expected: FAIL — `relayer` is not exported from `../config`

- [ ] **Step 3: Implement the `relayer()` function**

Add to `packages/react-sdk/src/config.ts`, before the `createZamaConfig` function:

````ts
/**
 * Create a per-chain transport override with the given relayer proxy URL.
 *
 * @example
 * ```ts
 * createZamaConfig({
 *   wagmiConfig,
 *   transports: {
 *     [sepolia.id]: relayer("/api/relayer/11155111"),
 *   },
 * });
 * ```
 */
export function relayer(
  relayerUrl: string,
  overrides?: Partial<ExtendedFhevmInstanceConfig>,
): Partial<ExtendedFhevmInstanceConfig> {
  return { relayerUrl, ...overrides };
}
````

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run --project react-sdk -- config.test.ts -t "relayer() helper" -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/react-sdk/src/config.ts packages/react-sdk/src/__tests__/config.test.ts
git commit -m "feat(react-sdk): add relayer() transport helper"
```

---

### Task 2: Add wagmi network inference and test it

**Files:**

- Modify: `packages/react-sdk/src/config.ts` (update `resolveTransports`)
- Modify: `packages/react-sdk/src/__tests__/config.test.ts`

- [ ] **Step 1: Update `mockWagmiConfig` to support `_internal.transports`**

In `packages/react-sdk/src/__tests__/config.test.ts`, replace the `mockWagmiConfig` function:

```ts
function mockWagmiConfig(chainIds: number[] = [11155111], rpcUrls?: Record<number, string>) {
  return {
    chains: chainIds.map((id) => ({ id, name: `Chain ${id}` })),
    _internal: {
      transports: Object.fromEntries(
        chainIds.map((id) => [
          id,
          rpcUrls?.[id] ? () => ({ value: { url: rpcUrls[id] } }) : () => ({ value: undefined }),
        ]),
      ),
    },
  } as any;
}
```

- [ ] **Step 2: Write the failing tests for network inference**

Add to the `"transport resolution"` describe block in the test file:

```ts
it("infers network from wagmi http transport", () => {
  createZamaConfig({
    wagmiConfig: mockWagmiConfig([11155111], {
      [11155111]: "https://sepolia.infura.io/v3/KEY",
    }),
    transports: {
      [11155111]: relayer("/api/relayer/11155111"),
    },
  });
  expect(MockRelayerWeb).toHaveBeenCalledWith(
    expect.objectContaining({
      transports: expect.objectContaining({
        [11155111]: expect.objectContaining({
          relayerUrl: "/api/relayer/11155111",
          network: "https://sepolia.infura.io/v3/KEY",
        }),
      }),
    }),
  );
});

it("user override wins over inferred network", () => {
  createZamaConfig({
    wagmiConfig: mockWagmiConfig([11155111], {
      [11155111]: "https://sepolia.infura.io/v3/KEY",
    }),
    transports: {
      [11155111]: relayer("/api/relayer/11155111", {
        network: "https://custom-rpc.com",
      }),
    },
  });
  expect(MockRelayerWeb).toHaveBeenCalledWith(
    expect.objectContaining({
      transports: expect.objectContaining({
        [11155111]: expect.objectContaining({
          network: "https://custom-rpc.com",
        }),
      }),
    }),
  );
});

it("does not infer network when wagmi transport has no url", () => {
  createZamaConfig({
    wagmiConfig: mockWagmiConfig([11155111]),
  });
  expect(MockRelayerWeb).toHaveBeenCalledWith(
    expect.objectContaining({
      transports: expect.objectContaining({
        [11155111]: expect.objectContaining({
          network: SepoliaConfig.network,
        }),
      }),
    }),
  );
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run --project react-sdk -- config.test.ts -t "transport resolution" -v`
Expected: FAIL — "infers network from wagmi http transport" fails because `resolveTransports` doesn't read `_internal.transports`

- [ ] **Step 4: Update `resolveTransports` to infer network**

In `packages/react-sdk/src/config.ts`, replace the wagmi branch of `resolveTransports`:

```ts
function resolveTransports(
  params: CreateZamaConfigWithTransports,
): Record<number, Partial<ExtendedFhevmInstanceConfig>> {
  if ("wagmiConfig" in params && params.wagmiConfig) {
    const resolved: Record<number, Partial<ExtendedFhevmInstanceConfig>> = {};
    for (const chain of params.wagmiConfig.chains) {
      const defaultConfig = DefaultConfigs[chain.id];
      const userOverride = params.transports?.[chain.id];
      if (!defaultConfig && !userOverride) {
        throw new ConfigurationError(
          `Chain ${chain.id} (${chain.name}) has no default FHE config and no transport override was provided. ` +
            `Either remove this chain from your wagmi config or provide a transport override via the transports option.`,
        );
      }

      const wagmiTransport = (params.wagmiConfig as any)._internal?.transports?.[chain.id];
      const inferredNetwork: string | undefined = wagmiTransport?.({ chain })?.value?.url;

      resolved[chain.id] = {
        ...defaultConfig,
        ...(inferredNetwork ? { network: inferredNetwork } : {}),
        ...userOverride,
      };
    }
    return resolved;
  }
  return params.transports;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run --project react-sdk -- config.test.ts -v`
Expected: PASS (all tests)

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @zama-fhe/react-sdk typecheck`
Expected: Clean

- [ ] **Step 7: Commit**

```bash
git add packages/react-sdk/src/config.ts packages/react-sdk/src/__tests__/config.test.ts
git commit -m "feat(react-sdk): infer network from wagmi transports in resolveTransports"
```

---

### Task 3: Export `relayer()` from package entrypoints

**Files:**

- Modify: `packages/react-sdk/src/index.ts`

- [ ] **Step 1: Add `relayer` to the react-sdk exports**

In `packages/react-sdk/src/index.ts`, find the line that exports `createZamaConfig` and add `relayer` next to it:

```ts
export { createZamaConfig, relayer } from "./config";
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @zama-fhe/react-sdk typecheck`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add packages/react-sdk/src/index.ts
git commit -m "feat(react-sdk): export relayer() from package entrypoint"
```

---

### Task 4: Update examples to use `relayer()`

**Files:**

- Modify: `examples/react-wagmi/src/providers.tsx`
- Modify: `examples/react-viem/src/providers.tsx`
- Modify: `examples/react-ethers/src/providers.tsx`

- [ ] **Step 1: Update react-wagmi example**

In `examples/react-wagmi/src/providers.tsx`, add `relayer` to the react-sdk import and simplify the transports:

```ts
import {
  ZamaProvider,
  ZamaSDKEvents,
  indexedDBStorage,
  savePendingUnshield,
  createZamaConfig,
  relayer,
} from "@zama-fhe/react-sdk";
```

Replace the `transports` block in `createZamaConfig({...})`:

```ts
  transports: {
    [SepoliaConfig.chainId]: relayer(`${window.location.origin}/api/relayer`),
  },
```

Remove the `SepoliaConfig` import from `@zama-fhe/sdk` if it's no longer used elsewhere in the file. If `SepoliaConfig.chainId` is the only usage, replace with `11155111` and drop the import, or keep the import for the chain ID constant.

- [ ] **Step 2: Update react-viem example**

In `examples/react-viem/src/providers.tsx`, add `relayer` to the import and simplify. Since this is the viem path (no wagmi network inference), keep `network` explicit:

```ts
import {
  ZamaProvider,
  ZamaSDKEvents,
  indexedDBStorage,
  savePendingUnshield,
  createZamaConfig,
  relayer,
} from "@zama-fhe/react-sdk";
```

Replace the transports block:

```ts
      transports: {
        [SepoliaConfig.chainId]: relayer(
          `${window.location.origin}/api/relayer`,
          { network: SEPOLIA_RPC_URL },
        ),
      },
```

Remove the `...SepoliaConfig` spread.

- [ ] **Step 3: Update react-ethers example**

Same pattern as react-viem — add `relayer` import, replace `...SepoliaConfig` spread with `relayer()` call including explicit `network`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck 2>&1 | grep -v test-nextjs`
Expected: Clean (ignoring pre-existing test-nextjs error)

- [ ] **Step 5: Commit**

```bash
git add examples/react-wagmi/src/providers.tsx examples/react-viem/src/providers.tsx examples/react-ethers/src/providers.tsx
git commit -m "refactor(examples): use relayer() helper in transport config"
```

---

### Task 5: Update docs to use `relayer()`

**Files:**

- Modify: `docs/gitbook/src/reference/react/ZamaProvider.md`
- Modify: `docs/gitbook/src/tutorials/quick-start.md`
- Modify: `docs/gitbook/src/tutorials/first-confidential-dapp.md`
- Modify: `docs/gitbook/src/guides/nextjs-ssr.md`
- Modify: `packages/react-sdk/README.md`

- [ ] **Step 1: Update all docs that show `createZamaConfig` with transport config**

In each file, replace patterns like:

```ts
transports: {
  [SepoliaConfig.chainId]: {
    relayerUrl: "...",
    network: "...",
  },
},
```

With:

```ts
transports: {
  [sepolia.id]: relayer("/api/relayer/11155111"),
},
```

For wagmi examples (network inferred), use just `relayer(url)`.
For viem/ethers examples (no wagmi), use `relayer(url, { network: "..." })`.

Add `relayer` to import statements where `createZamaConfig` is imported.

- [ ] **Step 2: Commit**

```bash
git add docs/ packages/react-sdk/README.md
git commit -m "docs: update examples to use relayer() transport helper"
```
