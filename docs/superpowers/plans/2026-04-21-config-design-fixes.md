# Config Design Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four design issues in the createZamaConfig system: brand ZamaConfig to prevent manual construction, remove legacy ZamaProvider props, eliminate node:worker_threads from the browser chunk graph, and fix registryAddresses merge order.

**Architecture:** ZamaConfig becomes branded (opaque). The node transport handler moves to `@zama-fhe/sdk/node` via a registration pattern, so browser bundles never reference `relayer-node`. ZamaProvider accepts only `config: ZamaConfig`. The `registryAddresses` override takes precedence over chain definitions.

**Tech Stack:** TypeScript, Vitest, React, rolldown, pnpm monorepo

---

## File Map

| File                                                | Action           | Responsibility                                                        |
| --------------------------------------------------- | ---------------- | --------------------------------------------------------------------- |
| `packages/sdk/src/config/types.ts`                  | Modify           | Add brand symbol to ZamaConfig                                        |
| `packages/sdk/src/config/resolve.ts`                | Modify           | Replace hardcoded node handler with registry; export registration API |
| `packages/sdk/src/config/index.ts`                  | Modify           | Stamp brand on createZamaConfig return; re-export registration API    |
| `packages/sdk/src/node/index.ts`                    | Modify           | Register node transport handler on import                             |
| `packages/sdk/src/index.ts`                         | Modify           | Remove `node` transport factory from main entry exports               |
| `packages/sdk/src/zama-sdk.ts`                      | Modify           | Fix registryAddresses merge order                                     |
| `packages/react-sdk/src/provider.tsx`               | Modify           | Remove legacy props, config-only API                                  |
| `packages/react-sdk/src/wagmi/config.ts`            | Modify           | Stamp brand on wagmi createZamaConfig return                          |
| `test/test-nextjs/src/providers.tsx`                | Modify           | Migrate to wagmi createZamaConfig                                     |
| `test/test-vite/src/providers.tsx`                  | No change needed | Already uses config API                                               |
| `examples/example-hoodi/src/providers.tsx`          | Modify           | Migrate to createZamaConfig with ethers + cleartext transport         |
| `packages/sdk/src/config/__tests__/resolve.test.ts` | Modify           | Add test for unregistered node transport error                        |
| `packages/react-sdk/src/__tests__/config.test.ts`   | Modify           | Verify brand prevents manual construction                             |

---

### Task 1: Brand ZamaConfig to prevent manual construction

**Files:**

- Modify: `packages/sdk/src/config/types.ts`
- Modify: `packages/sdk/src/config/index.ts`
- Modify: `packages/react-sdk/src/wagmi/config.ts`
- Modify: `test/test-vite/src/providers.tsx` (remove manual `ZamaConfig` construction)
- Test: `packages/react-sdk/src/__tests__/config.test.ts`

- [ ] **Step 1: Add brand to ZamaConfig type**

In `packages/sdk/src/config/types.ts`, add a unique symbol brand:

```ts
/** @internal Nominal brand — prevents constructing ZamaConfig as a plain object. */
declare const __brand: unique symbol;

/** Opaque config object returned by {@link createZamaConfig}. */
export interface ZamaConfig {
  /** @internal */ readonly [__brand]: true;
  /** @internal */ readonly chains: readonly FheChain[];
  /** @internal */ readonly relayer: RelayerSDK;
  /** @internal */ readonly signer: GenericSigner;
  /** @internal */ readonly storage: GenericStorage;
  /** @internal */ readonly sessionStorage: GenericStorage;
  /** @internal */ readonly keypairTTL: number | undefined;
  /** @internal */ readonly sessionTTL: number | "infinite" | undefined;
  /** @internal */ readonly registryTTL: number | undefined;
  /** @internal */ readonly onEvent: ZamaSDKEventListener | undefined;
}
```

- [ ] **Step 2: Cast return in createZamaConfig (base SDK)**

In `packages/sdk/src/config/index.ts`, cast the return to `ZamaConfig`:

```ts
export function createZamaConfig(params: CreateZamaConfigBaseParams): ZamaConfig {
  // ... existing logic ...
  return {
    chains: params.chains,
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  } as ZamaConfig;
}
```

- [ ] **Step 3: Cast return in wagmi createZamaConfig**

In `packages/react-sdk/src/wagmi/config.ts`, same cast:

```ts
export function createZamaConfig(params: ZamaConfigWagmi): ZamaConfig {
  // ... existing logic ...
  return {
    chains: params.chains,
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  } as ZamaConfig;
}
```

- [ ] **Step 4: Fix test-vite providers that manually construct ZamaConfig**

In `test/test-vite/src/providers.tsx`, the code manually constructs `const zamaConfig: ZamaConfig = { ... }`. Replace with:

```ts
import { createZamaConfig as createWagmiZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { cleartext, web } from "@zama-fhe/sdk";
import { hardhat } from "@zama-fhe/sdk/chains";
// ... (remove manual ZamaConfig construction, use createWagmiZamaConfig)
```

The full providers.tsx will be updated to use `createWagmiZamaConfig` with cleartext transport and a custom chain that includes the registry address.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — all packages compile. Any code that tries `const x: ZamaConfig = { ... }` will fail because the brand property can't be satisfied.

- [ ] **Step 6: Commit**

```
feat(sdk): brand ZamaConfig to prevent manual construction
```

---

### Task 2: Remove node transport from resolve.ts, use registration pattern

**Files:**

- Modify: `packages/sdk/src/config/resolve.ts`
- Modify: `packages/sdk/src/node/index.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/config/__tests__/resolve.test.ts`

- [ ] **Step 1: Add transport handler registry to resolve.ts**

In `packages/sdk/src/config/resolve.ts`, add a transport factory registry above `buildRelayer`:

```ts
// ── Transport handler registry ──────────────────────────────────────────────

type TransportHandlerFn = (
  chain: ExtendedFhevmInstanceConfig,
  transport: TransportConfig,
) => Promise<RelayerSDK>;

const transportHandlers = new Map<string, TransportHandlerFn>();

/** Register a transport handler. Called by sub-path modules (e.g. @zama-fhe/sdk/node). */
export function registerTransportHandler(type: string, handler: TransportHandlerFn): void {
  transportHandlers.set(type, handler);
}

// Built-in handlers (browser-safe)
registerTransportHandler("web", (chain, transport) => {
  if (transport.type !== "web") throw new Error("unreachable");
  const merged = { ...chain, ...transport.chain };
  if (!merged.relayerUrl) {
    throw new ConfigurationError(
      `Chain ${chain.chainId} has an empty relayerUrl. Use cleartext() for chains without a relayer.`,
    );
  }
  return import("../relayer/relayer-web").then(
    (m) => new m.RelayerWeb({ chain: merged, ...transport.relayer }),
  );
});

registerTransportHandler("cleartext", (chain, transport) => {
  if (transport.type !== "cleartext") throw new Error("unreachable");
  const merged = { ...chain, ...transport.chain } as CleartextConfig;
  return import("../relayer/cleartext/relayer-cleartext").then(
    (m) => new m.RelayerCleartext(merged),
  );
});
```

- [ ] **Step 2: Rewrite buildRelayer to use the registry**

Replace the hardcoded `if (transport.type === ...)` chain in `buildRelayer` with:

```ts
export function buildRelayer(
  chainTransports: Map<number, ResolvedChainTransport>,
  resolveChainId: () => Promise<number>,
): RelayerSDK {
  if (chainTransports.size === 0) {
    throw new ConfigurationError(
      "No chain transports configured. Add at least one chain to the chains array.",
    );
  }

  const perChainRelayers = new Map<number, Promise<RelayerSDK>>();

  for (const { chain, transport } of chainTransports.values()) {
    const handler = transportHandlers.get(transport.type);
    if (!handler) {
      const hint =
        transport.type === "node"
          ? ' Import "@zama-fhe/sdk/node" to enable Node.js transports.'
          : "";
      throw new ConfigurationError(
        `No transport handler registered for type "${transport.type}".${hint}`,
      );
    }
    perChainRelayers.set(chain.chainId, handler(chain, transport));
  }

  return new CompositeRelayer(resolveChainId, perChainRelayers);
}
```

- [ ] **Step 3: Register node handler in node/index.ts**

In `packages/sdk/src/node/index.ts`, add at the top (after existing exports):

```ts
import { registerTransportHandler } from "../config/resolve";

registerTransportHandler("node", (chain, transport) => {
  if (transport.type !== "node") throw new Error("unreachable");
  const merged = { ...chain, ...transport.chain };
  if (!merged.relayerUrl) {
    throw new ConfigurationError(
      `Chain ${chain.chainId} has an empty relayerUrl. Use cleartext() for chains without a relayer.`,
    );
  }
  return import("../relayer/relayer-node").then(
    (m) => new m.RelayerNode({ chain: merged, ...transport.relayer }),
  );
});
```

Note: also add the `ConfigurationError` import.

- [ ] **Step 4: Remove `node` factory from main SDK entry exports**

In `packages/sdk/src/index.ts`, remove `node` from the config factory export block:

```ts
// Before
export {
  createZamaConfig,
  web,
  node, // ← remove this
  cleartext,
  resolveChainTransports,
  buildRelayer,
  resolveStorage,
} from "./config";

// After
export {
  createZamaConfig,
  web,
  cleartext,
  resolveChainTransports,
  buildRelayer,
  resolveStorage,
} from "./config";
```

Also remove `NodeTransportConfig` from the type exports (keep it only in config sub-exports for direct consumers).

Export `node` from `packages/sdk/src/node/index.ts` instead:

```ts
export { node } from "../config/transports";
```

Also export `registerTransportHandler` from the config module so it's available:

```ts
export { registerTransportHandler } from "./resolve";
```

- [ ] **Step 5: Update resolve.test.ts for unregistered node transport**

In `packages/sdk/src/config/__tests__/resolve.test.ts`, the existing mock for `relayer-node` is no longer needed by `buildRelayer`. The `node` test in `resolveChainTransports` still works (it just resolves chain transport entries). But `buildRelayer` with a node transport should now throw unless the handler is registered.

Add a test:

```ts
it("throws for node transport when handler is not registered", () => {
  // Note: the test file does NOT import @zama-fhe/sdk/node, so handler isn't registered
  // But we mock relayer-node above, so it IS registered via the mock.
  // We need to test the real registry behavior.
});
```

Actually, since the test file mocks `relayer-node` at import time, we need to adjust. The `vi.mock(import("../../relayer/relayer-node"))` mock won't be needed for resolve.ts tests anymore since resolve.ts no longer imports it. Remove that mock and verify the node-related buildRelayer tests. The `resolveChainTransports` tests for node still pass (they don't invoke buildRelayer). For buildRelayer, remove the node-relayerUrl test and add:

```ts
it("throws for node transport when handler is not registered", () => {
  const transports = resolveChainTransports([sepoliaChain], { [11155111]: node() }, [11155111]);
  expect(() => buildRelayer(transports, resolveChainId)).toThrow(
    'No transport handler registered for type "node"',
  );
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm vitest run packages/sdk/src/config/__tests__/resolve.test.ts`
Expected: PASS

- [ ] **Step 7: Rebuild SDK and verify no node:worker_threads in main entry chunk**

Run: `pnpm --filter @zama-fhe/sdk build`
Then verify: `grep "worker_threads" packages/sdk/dist/esm/index.js` should return nothing.
And: `grep "relayer-node" packages/sdk/dist/esm/index.js` should return nothing.

- [ ] **Step 8: Commit**

```
refactor(sdk): move node transport handler to @zama-fhe/sdk/node entry

Browser bundles no longer reference relayer-node or node:worker_threads.
The node() transport factory is registered via side-effect import in
@zama-fhe/sdk/node. Using node() transport without importing that module
throws a clear error with remediation guidance.
```

---

### Task 3: Remove legacy ZamaProvider props (fix #2)

**Files:**

- Modify: `packages/react-sdk/src/provider.tsx`
- Modify: `test/test-nextjs/src/providers.tsx`
- Modify: `examples/example-hoodi/src/providers.tsx`

- [ ] **Step 1: Simplify ZamaProvider to config-only**

Replace the entire `packages/react-sdk/src/provider.tsx` with the clean config-only version:

````tsx
"use client";

import type { ZamaConfig } from "@zama-fhe/sdk";
import { ZamaSDK } from "@zama-fhe/sdk";
import { invalidateWalletLifecycleQueries } from "@zama-fhe/sdk/query";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

/** Props for {@link ZamaProvider}. */
export interface ZamaProviderProps extends PropsWithChildren {
  /** Configuration object created by {@link createZamaConfig}. */
  config: ZamaConfig;
}

const ZamaSDKContext = createContext<ZamaSDK | null>(null);

/**
 * Provides a {@link ZamaSDK} instance to all descendant hooks.
 *
 * @example
 * ```tsx
 * <ZamaProvider config={zamaConfig}>
 *   <App />
 * </ZamaProvider>
 * ```
 */
export function ZamaProvider({ children, config }: ZamaProviderProps) {
  const queryClient = useQueryClient();

  const onEventRef = useRef(config.onEvent);

  useEffect(() => {
    onEventRef.current = config.onEvent;
  });

  const signerLifecycleCallbacks = useMemo(
    () =>
      config.signer?.subscribe
        ? {
            onDisconnect: () => invalidateWalletLifecycleQueries(queryClient),
            onAccountChange: () => invalidateWalletLifecycleQueries(queryClient),
            onChainChange: () => invalidateWalletLifecycleQueries(queryClient),
          }
        : undefined,
    [queryClient, config.signer],
  );

  const sdk = useMemo(
    () =>
      new ZamaSDK({
        chains: config.chains,
        relayer: config.relayer,
        signer: config.signer,
        storage: config.storage,
        sessionStorage: config.sessionStorage,
        keypairTTL: config.keypairTTL,
        sessionTTL: config.sessionTTL,
        registryTTL: config.registryTTL,
        onEvent: onEventRef.current,
        signerLifecycleCallbacks,
      }),
    [config, signerLifecycleCallbacks],
  );

  useEffect(() => () => sdk.dispose(), [sdk]);

  return <ZamaSDKContext.Provider value={sdk}>{children}</ZamaSDKContext.Provider>;
}

export function useZamaSDK(): ZamaSDK {
  const context = useContext(ZamaSDKContext);
  if (!context) {
    throw new Error(
      "useZamaSDK must be used within a <ZamaProvider>. " +
        "Wrap your component tree in <ZamaProvider config={createZamaConfig(...)}>.",
    );
  }
  return context;
}
````

- [ ] **Step 2: Migrate test-nextjs to wagmi createZamaConfig**

Replace `test/test-nextjs/src/providers.tsx`:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { cleartext } from "@zama-fhe/sdk";
import { hardhat } from "@zama-fhe/sdk/chains";
import { hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { burner } from "@zama-fhe/test-components";
import type { ReactNode } from "react";
import { getAddress } from "viem";
import { createConfig, http, WagmiProvider } from "wagmi";
import { anvil } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import deployments from "../../../contracts/deployments.json" with { type: "json" };

const anvilPort = process.env.NEXT_PUBLIC_ANVIL_PORT || "8545";
const rpcUrl = `http://127.0.0.1:${anvilPort}`;

const wagmiConfig = createConfig({
  chains: [anvil],
  connectors: [burner({ rpcUrls: { [anvil.id]: rpcUrl } }), injected()],
  transports: { [anvil.id]: http(rpcUrl) },
});

const zamaConfig = createZamaConfig({
  chains: [
    {
      ...hardhat,
      registryAddress: getAddress(deployments.wrappersRegistry),
    },
  ],
  wagmiConfig,
  transports: {
    [anvil.id]: cleartext({
      ...hardhatCleartextConfig,
      network: rpcUrl,
    }),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Migrate example-hoodi to createZamaConfig**

In `examples/example-hoodi/src/providers.tsx`, replace the manual relayer + signer wiring with `createZamaConfig` from `@zama-fhe/sdk` using the ethers path. The config factory handles everything except the hybrid ethereum provider, which stays as-is.

Key changes:

- Import `createZamaConfig` and `cleartext` from `@zama-fhe/sdk`
- Import `hoodi` from `@zama-fhe/sdk/chains`
- Import `hoodiCleartextConfig` from `@zama-fhe/sdk/cleartext`
- Replace the `useMemo(() => new RelayerCleartext(...))` and `useMemo(() => createZamaConfig(...))` with a single `createZamaConfig` call using the ethers adapter

- [ ] **Step 4: Remove registryAddresses from ZamaSDKConfig**

Since all apps now use `createZamaConfig` which bakes registry addresses into the chain definitions, the legacy `registryAddresses` field on `ZamaSDKConfig` is no longer needed by the provider. However, keep it for the SDK constructor since `createWrappersRegistry()` still accepts overrides.

Actually — keep `registryAddresses` on `ZamaSDKConfig` for now; it's still useful for advanced consumers. Just remove it from the ZamaProvider legacy path (which we're deleting anyway).

- [ ] **Step 5: Run typecheck and tests**

Run: `pnpm typecheck`
Run: `pnpm vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```
refactor(react-sdk): remove legacy prop-based ZamaProvider API

ZamaProvider now only accepts config: ZamaConfig.
Migrated test-nextjs and example-hoodi to createZamaConfig.
```

---

### Task 4: Fix registryAddresses merge order (fix #4)

**Files:**

- Modify: `packages/sdk/src/zama-sdk.ts`

- [ ] **Step 1: Swap merge order so user overrides win**

In `packages/sdk/src/zama-sdk.ts` constructor, change:

```ts
// Before: chain definitions override user's registryAddresses
const registryAddresses: Record<number, Address> = { ...config.registryAddresses };
for (const chain of config.chains ?? []) {
  if (chain.registryAddress) {
    registryAddresses[chain.id] = chain.registryAddress;
  }
}

// After: user's registryAddresses override chain definitions
const registryAddresses: Record<number, Address> = {};
for (const chain of config.chains ?? []) {
  if (chain.registryAddress) {
    registryAddresses[chain.id] = chain.registryAddress;
  }
}
Object.assign(registryAddresses, config.registryAddresses);
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```
fix(sdk): registryAddresses overrides take precedence over chain definitions
```

---

### Task 5: Update API reports and verify build

- [ ] **Step 1: Rebuild all packages**

Run: `pnpm --filter @zama-fhe/sdk build && pnpm --filter @zama-fhe/react-sdk build`

- [ ] **Step 2: Regenerate API reports**

Run: `pnpm --filter @zama-fhe/sdk api-report && pnpm --filter @zama-fhe/react-sdk api-report`

- [ ] **Step 3: Verify no node:worker_threads in browser chunks**

Run: `grep -r "worker_threads" packages/sdk/dist/esm/index.js` — should return nothing.
Run: `grep -r "relayer-node" packages/sdk/dist/esm/index.js` — should return nothing.
Run: `grep -r "relayer-node" packages/sdk/dist/esm/node/index.js` — SHOULD find it (registered there).

- [ ] **Step 4: Run full test suite**

Run: `pnpm vitest run`
Run: `pnpm typecheck`
Expected: All PASS

- [ ] **Step 5: Commit API reports**

```
chore(sdk): update API reports after config design fixes
```
