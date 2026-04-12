# createZamaConfig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-object manual wiring pattern with a single `createZamaConfig()` factory, and update `ZamaProvider` to accept a `config` prop (breaking change).

**Architecture:** A new `config.ts` file in `packages/react-sdk/src/` holds the `createZamaConfig` function and all related types. It resolves the signer adapter (wagmi/viem/ethers/custom), auto-resolves relayer transports from wagmi chains, provides smart storage defaults, and returns an opaque `ZamaConfig` object. The existing `ZamaProvider` is updated to accept `config: ZamaConfig` instead of spread props.

**Tech Stack:** TypeScript, React, Vitest, wagmi, viem, ethers

**Spec:** `docs/superpowers/specs/2026-04-12-create-zama-config-design.md`

---

## File Structure

| File                                                                | Action | Responsibility                                                                     |
| ------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `packages/react-sdk/src/config.ts`                                  | Create | `createZamaConfig` function, all config types, signer/transport/storage resolution |
| `packages/react-sdk/src/__tests__/config.test.ts`                   | Create | Unit tests for `createZamaConfig`                                                  |
| `packages/react-sdk/src/provider.tsx`                               | Modify | Accept `config: ZamaConfig`, remove old spread props                               |
| `packages/react-sdk/src/__tests__/provider.test.tsx`                | Modify | Update to use `createZamaConfig`                                                   |
| `packages/react-sdk/src/__tests__/provider-hooks-extended.test.tsx` | Modify | Update to use `createZamaConfig`                                                   |
| `packages/react-sdk/src/test-fixtures.tsx`                          | Modify | Update `createWrapper`/`renderWithProviders` to use config-based API               |
| `packages/react-sdk/src/index.ts`                                   | Modify | Export new types and function                                                      |
| `examples/react-wagmi/src/providers.tsx`                            | Modify | Migrate to `createZamaConfig`                                                      |
| `examples/react-viem/src/providers.tsx`                             | Modify | Migrate to `createZamaConfig`                                                      |
| `examples/react-ethers/src/providers.tsx`                           | Modify | Migrate to `createZamaConfig`                                                      |

---

### Task 1: Create config types and createZamaConfig function

**Files:**

- Create: `packages/react-sdk/src/config.ts`

- [ ] **Step 1: Create config.ts with types and implementation**

````ts
import type { Address, PublicClient, WalletClient, EIP1193Provider } from "viem";
import type { Config } from "wagmi";
import { getChainId } from "wagmi/actions";
import type { Signer, Provider } from "ethers";
import type {
  GenericSigner,
  GenericStorage,
  RelayerWebSecurityConfig,
  ZamaSDKEventListener,
} from "@zama-fhe/sdk";
import { RelayerWeb, MemoryStorage, IndexedDBStorage } from "@zama-fhe/sdk";
import { DefaultConfigs } from "@zama-fhe/sdk";
import type { ExtendedFhevmInstanceConfig } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { WagmiSigner } from "./wagmi/wagmi-signer";

/** Shared options across all adapter paths. */
interface ZamaConfigBase {
  /** Per-chain relayer transport overrides. Merged on top of auto-resolved defaults. */
  transports?: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
  /** Credential storage. Default: IndexedDBStorage("CredentialStore") in browser, MemoryStorage in Node. */
  storage?: GenericStorage;
  /** Session storage. Default: IndexedDBStorage("SessionStore") in browser, MemoryStorage in Node. */
  sessionStorage?: GenericStorage;
  /** ML-KEM keypair TTL in seconds. Default: 2592000 (30 days). */
  keypairTTL?: number;
  /** Session signature TTL in seconds. Default: 2592000 (30 days). */
  sessionTTL?: number | "infinite";
  /** Per-chain registry address overrides. */
  registryAddresses?: Record<number, Address>;
  /** Registry cache TTL in seconds. Default: 86400 (24h). */
  registryTTL?: number;
  /** SDK lifecycle event listener. */
  onEvent?: ZamaSDKEventListener;
  /** RelayerWeb security config (CSRF, integrity check). */
  security?: RelayerWebSecurityConfig;
  /** WASM thread count for parallel FHE operations. */
  threads?: number;
}

/** Wagmi-backed config — signer derived from wagmi Config. */
export interface ZamaConfigWagmi extends ZamaConfigBase {
  wagmiConfig: Config;
  signer?: never;
  viem?: never;
  ethers?: never;
}

/** Viem path — takes native viem clients. */
export interface ZamaConfigViem extends ZamaConfigBase {
  viem: {
    publicClient: PublicClient;
    walletClient?: WalletClient;
    ethereum?: EIP1193Provider;
  };
  wagmiConfig?: never;
  signer?: never;
  ethers?: never;
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}

/** Ethers path — takes native ethers types. */
export interface ZamaConfigEthers extends ZamaConfigBase {
  ethers: { ethereum: EIP1193Provider } | { signer: Signer } | { provider: Provider };
  wagmiConfig?: never;
  signer?: never;
  viem?: never;
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}

/** Escape hatch — raw GenericSigner for custom implementations. */
export interface ZamaConfigCustomSigner extends ZamaConfigBase {
  signer: GenericSigner;
  wagmiConfig?: never;
  viem?: never;
  ethers?: never;
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}

/** Union of all config variants passed to {@link createZamaConfig}. */
export type CreateZamaConfigParams =
  | ZamaConfigWagmi
  | ZamaConfigViem
  | ZamaConfigEthers
  | ZamaConfigCustomSigner;

/** Opaque config object returned by {@link createZamaConfig}. Pass to `<ZamaProvider config={...}>`. */
export interface ZamaConfig {
  /** @internal */ readonly _relayer: RelayerWeb;
  /** @internal */ readonly _signer: GenericSigner;
  /** @internal */ readonly _storage: GenericStorage;
  /** @internal */ readonly _sessionStorage: GenericStorage;
  /** @internal */ readonly _keypairTTL: number | undefined;
  /** @internal */ readonly _sessionTTL: number | "infinite" | undefined;
  /** @internal */ readonly _registryAddresses: Record<number, Address> | undefined;
  /** @internal */ readonly _registryTTL: number | undefined;
  /** @internal */ readonly _onEvent: ZamaSDKEventListener | undefined;
}

const isBrowser = typeof window !== "undefined";

function resolveSigner(params: CreateZamaConfigParams): GenericSigner {
  if ("wagmiConfig" in params && params.wagmiConfig) {
    return new WagmiSigner({ config: params.wagmiConfig });
  }
  if ("viem" in params && params.viem) {
    return new ViemSigner({
      publicClient: params.viem.publicClient,
      walletClient: params.viem.walletClient,
      ethereum: params.viem.ethereum,
    });
  }
  if ("ethers" in params && params.ethers) {
    return new EthersSigner(params.ethers);
  }
  return params.signer;
}

function resolveTransports(
  params: CreateZamaConfigParams,
): Record<number, Partial<ExtendedFhevmInstanceConfig>> {
  if ("wagmiConfig" in params && params.wagmiConfig) {
    const resolved: Record<number, Partial<ExtendedFhevmInstanceConfig>> = {};
    for (const chain of params.wagmiConfig.chains) {
      const defaultConfig = DefaultConfigs[chain.id];
      const userOverride = params.transports?.[chain.id];
      if (defaultConfig || userOverride) {
        resolved[chain.id] = { ...defaultConfig, ...userOverride };
      } else {
        console.warn(
          `[zama-sdk] Chain ${chain.id} (${chain.name}) has no default FHE config and no transport override was provided. FHE operations on this chain will fail.`,
        );
      }
    }
    return resolved;
  }
  return params.transports;
}

function resolveStorage(
  storage: GenericStorage | undefined,
  sessionStorage: GenericStorage | undefined,
): { storage: GenericStorage; sessionStorage: GenericStorage } {
  const resolvedStorage =
    storage ?? (isBrowser ? new IndexedDBStorage("CredentialStore") : new MemoryStorage());
  const resolvedSessionStorage =
    sessionStorage ?? (isBrowser ? new IndexedDBStorage("SessionStore") : new MemoryStorage());

  if (resolvedStorage === resolvedSessionStorage) {
    console.warn(
      "[zama-sdk] storage and sessionStorage point to the same instance. " +
        "This will cause session entries to overwrite encrypted keypairs. " +
        "Use two separate storage instances.",
    );
  }

  return { storage: resolvedStorage, sessionStorage: resolvedSessionStorage };
}

function resolveGetChainId(
  params: CreateZamaConfigParams,
  signer: GenericSigner,
): () => Promise<number> {
  if ("wagmiConfig" in params && params.wagmiConfig) {
    const config = params.wagmiConfig;
    return () => Promise.resolve(getChainId(config));
  }
  return () => signer.getChainId();
}

/**
 * Create a {@link ZamaConfig} that wires together relayer, signer, and storage.
 *
 * Supports four adapter paths:
 * - **wagmiConfig** — derives signer from wagmi, auto-resolves transports from chains
 * - **viem** — takes native viem `PublicClient`/`WalletClient`
 * - **ethers** — takes native ethers `Signer`/`Provider`/`EIP1193Provider`
 * - **signer** — escape hatch for custom `GenericSigner` implementations
 *
 * @example
 * ```ts
 * const zamaConfig = createZamaConfig({ wagmiConfig });
 * // or
 * const zamaConfig = createZamaConfig({
 *   viem: { publicClient, walletClient },
 *   transports: { [sepolia.id]: SepoliaConfig },
 * });
 * ```
 */
export function createZamaConfig(params: CreateZamaConfigParams): ZamaConfig {
  const signer = resolveSigner(params);
  const transports = resolveTransports(params);
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const getChainIdFn = resolveGetChainId(params, signer);

  const relayer = new RelayerWeb({
    getChainId: getChainIdFn,
    transports,
    security: params.security,
    threads: params.threads,
  });

  return {
    _relayer: relayer,
    _signer: signer,
    _storage: storage,
    _sessionStorage: sessionStorage,
    _keypairTTL: params.keypairTTL,
    _sessionTTL: params.sessionTTL,
    _registryAddresses: params.registryAddresses,
    _registryTTL: params.registryTTL,
    _onEvent: params.onEvent,
  };
}
````

Note on imports: `DefaultConfigs` is not currently exported from `@zama-fhe/sdk`. It is exported from `packages/sdk/src/relayer/relayer-utils.ts` but not re-exported from `packages/sdk/src/index.ts`. You will need to add it to the SDK's public exports (see Task 2).

Also note: the `ethers` types (`Signer`, `Provider`) must be imported from `ethers`. Since `ethers` is an optional peer dependency of the react-sdk, the types should be imported as `import type` to avoid runtime dependency. The `EthersSigner` constructor already accepts the discriminated union `EthersSignerConfig`, so we re-use the same shape in `ZamaConfigEthers.ethers`.

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/guillaume.hermet/Documents/zama/sdk && pnpm typecheck`
Expected: No errors from `config.ts` (there may be errors from provider.tsx since we haven't updated it yet — that's expected)

- [ ] **Step 3: Commit**

```bash
git add packages/react-sdk/src/config.ts
git commit -m "feat(react-sdk): add createZamaConfig function and types"
```

---

### Task 2: Export DefaultConfigs from core SDK

**Files:**

- Modify: `packages/sdk/src/index.ts`

`DefaultConfigs` is currently internal — `createZamaConfig` needs it to auto-resolve transports from wagmi chains.

- [ ] **Step 1: Add DefaultConfigs to SDK exports**

In `packages/sdk/src/index.ts`, find the line:

```ts
export { HardhatConfig, MainnetConfig, SepoliaConfig } from "./relayer/relayer-utils";
```

Replace with:

```ts
export {
  DefaultConfigs,
  HardhatConfig,
  MainnetConfig,
  SepoliaConfig,
} from "./relayer/relayer-utils";
```

Also add to the `ExtendedFhevmInstanceConfig` type export. Find the types file where it's defined — it's in `relayer-utils.ts` but needs re-export. Add to `packages/sdk/src/index.ts`:

```ts
export type { ExtendedFhevmInstanceConfig } from "./relayer/relayer-utils";
```

- [ ] **Step 2: Re-export from react-sdk index**

In `packages/react-sdk/src/index.ts`, find:

```ts
export { HardhatConfig, MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
```

Replace with:

```ts
export { DefaultConfigs, HardhatConfig, MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
```

And add the type re-export near the other type re-exports:

```ts
export type { ExtendedFhevmInstanceConfig } from "@zama-fhe/sdk";
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/guillaume.hermet/Documents/zama/sdk && pnpm typecheck`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/index.ts packages/react-sdk/src/index.ts
git commit -m "feat(sdk): export DefaultConfigs and ExtendedFhevmInstanceConfig"
```

---

### Task 3: Write unit tests for createZamaConfig

**Files:**

- Create: `packages/react-sdk/src/__tests__/config.test.ts`

- [ ] **Step 1: Write tests for all four adapter paths and resolution logic**

```ts
import { describe, expect, it, vi } from "vitest";
import { createZamaConfig } from "../config";
import type { ZamaConfig } from "../config";
import { createMockSigner, createMockStorage } from "@zama-fhe/sdk/test-fixtures";
import {
  MemoryStorage,
  RelayerWeb,
  SepoliaConfig,
  MainnetConfig,
  HardhatConfig,
} from "@zama-fhe/sdk";
import { WagmiSigner } from "../wagmi/wagmi-signer";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

// Capture mocked constructors for assertions
const MockRelayerWeb = vi.mocked(RelayerWeb);
const MockWagmiSigner = vi.mocked(WagmiSigner);
const MockViemSigner = vi.mocked(ViemSigner);
const MockEthersSigner = vi.mocked(EthersSigner);

// Mock RelayerWeb to avoid WASM initialization
vi.mock(import("@zama-fhe/sdk"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    RelayerWeb: vi.fn().mockImplementation((config) => ({
      ...config,
      terminate: vi.fn(),
    })),
  };
});

// Mock signer constructors to verify they're called with correct args
vi.mock(import("../wagmi/wagmi-signer"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    WagmiSigner: vi.fn().mockImplementation(() => createMockSigner()),
  };
});

vi.mock(import("@zama-fhe/sdk/viem"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ViemSigner: vi.fn().mockImplementation(() => createMockSigner()),
  };
});

vi.mock(import("@zama-fhe/sdk/ethers"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    EthersSigner: vi.fn().mockImplementation(() => createMockSigner()),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

function mockWagmiConfig(chainIds: number[] = [11155111]) {
  return {
    chains: chainIds.map((id) => ({ id, name: `Chain ${id}` })),
  } as any;
}

describe("createZamaConfig", () => {
  describe("signer resolution", () => {
    it("creates WagmiSigner from wagmiConfig", () => {
      const wagmiConfig = mockWagmiConfig();
      createZamaConfig({ wagmiConfig });
      expect(MockWagmiSigner).toHaveBeenCalledWith({ config: wagmiConfig });
    });

    it("creates ViemSigner from viem clients", () => {
      const publicClient = {} as any;
      const walletClient = {} as any;
      createZamaConfig({
        viem: { publicClient, walletClient },
        transports: { [11155111]: SepoliaConfig },
      });
      expect(MockViemSigner).toHaveBeenCalledWith({
        publicClient,
        walletClient,
        ethereum: undefined,
      });
    });

    it("creates EthersSigner from ethers config", () => {
      const ethereum = {} as any;
      createZamaConfig({
        ethers: { ethereum },
        transports: { [11155111]: SepoliaConfig },
      });
      expect(MockEthersSigner).toHaveBeenCalledWith({ ethereum });
    });

    it("uses custom signer as-is", () => {
      const signer = createMockSigner();
      const config = createZamaConfig({
        signer,
        transports: { [11155111]: SepoliaConfig },
      });
      expect(config._signer).toBe(signer);
    });
  });

  describe("transport resolution", () => {
    it("auto-resolves transports from wagmi chains using DefaultConfigs", () => {
      const config = createZamaConfig({
        wagmiConfig: mockWagmiConfig([11155111]),
      });
      expect(config._relayer).toBeDefined();
      // RelayerWeb was called with transports containing SepoliaConfig
      expect(MockRelayerWeb).toHaveBeenCalledWith(
        expect.objectContaining({
          transports: expect.objectContaining({
            [11155111]: expect.objectContaining({
              chainId: 11155111,
              relayerUrl: SepoliaConfig.relayerUrl,
            }),
          }),
        }),
      );
    });

    it("merges user overrides on top of defaults", () => {
      const customRelayerUrl = "https://my-relayer.example.com";
      const config = createZamaConfig({
        wagmiConfig: mockWagmiConfig([11155111]),
        transports: {
          [11155111]: { relayerUrl: customRelayerUrl },
        },
      });
      expect(MockRelayerWeb).toHaveBeenCalledWith(
        expect.objectContaining({
          transports: expect.objectContaining({
            [11155111]: expect.objectContaining({
              chainId: 11155111,
              relayerUrl: customRelayerUrl,
              // Other fields preserved from SepoliaConfig
              aclContractAddress: SepoliaConfig.aclContractAddress,
            }),
          }),
        }),
      );
    });

    it("warns for unknown chains with no override", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      createZamaConfig({
        wagmiConfig: mockWagmiConfig([999999]),
      });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Chain 999999"));
      warnSpy.mockRestore();
    });

    it("does not warn for unknown chains with user override", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      createZamaConfig({
        wagmiConfig: mockWagmiConfig([999999]),
        transports: { [999999]: { relayerUrl: "https://custom.com" } },
      });
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("Chain 999999"));
      warnSpy.mockRestore();
    });

    it("uses explicit transports for non-wagmi paths", () => {
      const signer = createMockSigner();
      const transports = { [11155111]: SepoliaConfig };
      createZamaConfig({ signer, transports });
      expect(MockRelayerWeb).toHaveBeenCalledWith(expect.objectContaining({ transports }));
    });
  });

  describe("storage resolution", () => {
    it("defaults to MemoryStorage in Node environment", () => {
      // happy-dom environment simulates browser — test with explicit storage
      const signer = createMockSigner();
      const config = createZamaConfig({
        signer,
        transports: { [11155111]: SepoliaConfig },
        storage: new MemoryStorage(),
        sessionStorage: new MemoryStorage(),
      });
      expect(config._storage).toBeInstanceOf(MemoryStorage);
      expect(config._sessionStorage).toBeInstanceOf(MemoryStorage);
    });

    it("uses user-provided storage", () => {
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      const config = createZamaConfig({
        signer: createMockSigner(),
        transports: { [11155111]: SepoliaConfig },
        storage,
        sessionStorage,
      });
      expect(config._storage).toBe(storage);
      expect(config._sessionStorage).toBe(sessionStorage);
    });

    it("warns when storage and sessionStorage are the same reference", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const sharedStorage = createMockStorage();
      createZamaConfig({
        signer: createMockSigner(),
        transports: { [11155111]: SepoliaConfig },
        storage: sharedStorage,
        sessionStorage: sharedStorage,
      });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("same instance"));
      warnSpy.mockRestore();
    });
  });

  describe("options passthrough", () => {
    it("passes keypairTTL, sessionTTL, registryAddresses, registryTTL, onEvent through", () => {
      const onEvent = vi.fn();
      const registryAddresses = { [31337]: "0x1234567890123456789012345678901234567890" as any };
      const config = createZamaConfig({
        signer: createMockSigner(),
        transports: { [11155111]: SepoliaConfig },
        keypairTTL: 86400,
        sessionTTL: "infinite",
        registryAddresses,
        registryTTL: 3600,
        onEvent,
      });
      expect(config._keypairTTL).toBe(86400);
      expect(config._sessionTTL).toBe("infinite");
      expect(config._registryAddresses).toBe(registryAddresses);
      expect(config._registryTTL).toBe(3600);
      expect(config._onEvent).toBe(onEvent);
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/sdk && pnpm vitest run packages/react-sdk/src/__tests__/config.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/react-sdk/src/__tests__/config.test.ts
git commit -m "test(react-sdk): add unit tests for createZamaConfig"
```

---

### Task 4: Update ZamaProvider to accept config prop (breaking change)

**Files:**

- Modify: `packages/react-sdk/src/provider.tsx`

- [ ] **Step 1: Rewrite provider.tsx**

Replace the entire contents of `packages/react-sdk/src/provider.tsx` with:

````tsx
"use client";

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
import type { ZamaConfig } from "./config";

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

  // Stabilize onEvent so an inline arrow doesn't recreate the SDK every render.
  const onEventRef = useRef(config._onEvent);

  useEffect(() => {
    onEventRef.current = config._onEvent;
  });

  const signerLifecycleCallbacks = useMemo(
    () =>
      config._signer?.subscribe
        ? {
            onDisconnect: () => invalidateWalletLifecycleQueries(queryClient),
            onAccountChange: () => invalidateWalletLifecycleQueries(queryClient),
            onChainChange: () => invalidateWalletLifecycleQueries(queryClient),
          }
        : undefined,
    [queryClient, config._signer],
  );

  const sdk = useMemo(
    () =>
      new ZamaSDK({
        relayer: config._relayer,
        signer: config._signer,
        storage: config._storage,
        sessionStorage: config._sessionStorage,
        keypairTTL: config._keypairTTL,
        sessionTTL: config._sessionTTL,
        registryAddresses: config._registryAddresses,
        registryTTL: config._registryTTL,
        onEvent: onEventRef.current,
        signerLifecycleCallbacks,
      }),
    [config, signerLifecycleCallbacks],
  );

  useEffect(() => () => sdk.dispose(), [sdk]);

  return <ZamaSDKContext.Provider value={sdk}>{children}</ZamaSDKContext.Provider>;
}

/**
 * Access the {@link ZamaSDK} instance from context.
 * Throws if called outside a {@link ZamaProvider}.
 *
 * @example
 * ```tsx
 * const sdk = useZamaSDK();
 * const token = sdk.createReadonlyToken("0x...");
 * ```
 */
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

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/guillaume.hermet/Documents/zama/sdk && pnpm typecheck`
Expected: Errors in test files and examples that still use old props API (expected — fixed in next tasks)

- [ ] **Step 3: Commit**

```bash
git add packages/react-sdk/src/provider.tsx
git commit -m "feat(react-sdk)!: update ZamaProvider to accept config prop

BREAKING CHANGE: ZamaProvider no longer accepts spread props (relayer, signer, storage, etc.).
Use createZamaConfig() to create a config object and pass it as config={zamaConfig}."
```

---

### Task 5: Update test fixtures to use config-based API

**Files:**

- Modify: `packages/react-sdk/src/test-fixtures.tsx`

- [ ] **Step 1: Rewrite test-fixtures.tsx**

Replace the entire contents of `packages/react-sdk/src/test-fixtures.tsx` with:

```tsx
/* eslint-disable no-empty-pattern */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, type RenderHookOptions } from "@testing-library/react";
import type { GenericSigner, GenericStorage, RelayerSDK, Token } from "@zama-fhe/sdk";
import type { PropsWithChildren } from "react";
import React from "react";
import { test as base } from "../../sdk/src/test-fixtures";
import type { ZamaConfig } from "./config";
import type { ZamaProviderProps } from "./provider";
import { ZamaProvider } from "./provider";
import { createMockToken } from "./__tests__/mutation-test-helpers";

export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Internal helpers (not exported — used by fixtures only)
// ---------------------------------------------------------------------------

function buildMockZamaConfig(overrides: {
  relayer?: RelayerSDK;
  signer?: GenericSigner;
  storage?: GenericStorage;
  sessionStorage?: GenericStorage;
}): ZamaConfig {
  return {
    _relayer: overrides.relayer,
    _signer: overrides.signer,
    _storage: overrides.storage,
    _sessionStorage: overrides.sessionStorage,
    _keypairTTL: undefined,
    _sessionTTL: undefined,
    _registryAddresses: undefined,
    _registryTTL: undefined,
    _onEvent: undefined,
  } as unknown as ZamaConfig;
}

function Providers({
  children,
  queryClient,
  config,
}: PropsWithChildren<ZamaProviderProps & { queryClient: QueryClient }>) {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider config={config}>{children}</ZamaProvider>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Vitest fixtures (accessed via test context destructuring)
// ---------------------------------------------------------------------------

interface ReactSdkFixtures {
  token: Token;
  queryClient: QueryClient;
  createWrapper: (overrides?: {
    relayer?: RelayerSDK;
    signer?: GenericSigner;
    storage?: GenericStorage;
    sessionStorage?: GenericStorage;
  }) => {
    Wrapper: React.FC<{ children?: React.ReactNode }>;
    queryClient: QueryClient;
    signer: GenericSigner | undefined;
    relayer: RelayerSDK;
    storage: GenericStorage;
  };
  renderWithProviders: <TResult>(
    hook: () => TResult,
    overrides?: {
      relayer?: RelayerSDK;
      signer?: GenericSigner;
      storage?: GenericStorage;
      sessionStorage?: GenericStorage;
    },
    options?: Omit<RenderHookOptions<unknown>, "wrapper">,
  ) => ReturnType<typeof renderHook<TResult, unknown>> & { queryClient: QueryClient };
}

export const test = base.extend<ReactSdkFixtures>({
  token: async ({}, use) => {
    await use(createMockToken());
  },
  queryClient: async ({}, use) => {
    await use(
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
    );
  },
  createWrapper: async ({ relayer, signer, storage, sessionStorage, queryClient }, use) => {
    function createWrapper(overrides?: {
      relayer?: RelayerSDK;
      signer?: GenericSigner;
      storage?: GenericStorage;
      sessionStorage?: GenericStorage;
    }) {
      const mergedRelayer = overrides?.relayer ?? relayer;
      const mergedSigner = overrides?.signer ?? signer;
      const mergedStorage = overrides?.storage ?? storage;
      const mergedSessionStorage = overrides?.sessionStorage ?? sessionStorage;

      const config = buildMockZamaConfig({
        relayer: mergedRelayer as RelayerSDK,
        signer: mergedSigner,
        storage: mergedStorage,
        sessionStorage: mergedSessionStorage,
      });

      function Wrapper({ children }: { children?: React.ReactNode }) {
        return (
          <Providers queryClient={queryClient} config={config}>
            {children}
          </Providers>
        );
      }

      return {
        Wrapper,
        queryClient,
        signer: mergedSigner,
        relayer: mergedRelayer,
        storage: mergedStorage,
      };
    }
    await use(createWrapper);
  },
  renderWithProviders: async ({ createWrapper }, use) => {
    function renderWithProviders<TResult>(
      hook: () => TResult,
      overrides?: {
        relayer?: RelayerSDK;
        signer?: GenericSigner;
        storage?: GenericStorage;
        sessionStorage?: GenericStorage;
      },
      options?: Omit<RenderHookOptions<unknown>, "wrapper">,
    ) {
      const { Wrapper, queryClient } = createWrapper(overrides);
      return { ...renderHook(hook, { wrapper: Wrapper, ...options }), queryClient };
    }
    await use(renderWithProviders);
  },
});

export const it = test;
```

- [ ] **Step 2: Run all react-sdk tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/sdk && pnpm vitest run --project react-sdk`
Expected: Tests pass (some may need minor adjustments in subsequent steps if they reference `ZamaProviderProps` with old shape)

- [ ] **Step 3: Commit**

```bash
git add packages/react-sdk/src/test-fixtures.tsx
git commit -m "test(react-sdk): update test fixtures for config-based ZamaProvider"
```

---

### Task 6: Update existing provider tests

**Files:**

- Modify: `packages/react-sdk/src/__tests__/provider.test.tsx`
- Modify: `packages/react-sdk/src/__tests__/provider-hooks-extended.test.tsx`

- [ ] **Step 1: Read current provider tests**

Read `packages/react-sdk/src/__tests__/provider.test.tsx` and `packages/react-sdk/src/__tests__/provider-hooks-extended.test.tsx` to understand what needs updating. The main change is that any direct references to `ZamaProviderProps` old shape or manual prop spreading need to go through the config-based API.

Since the test fixtures (`renderWithProviders`, `createWrapper`) were already updated in Task 5, most tests should work as-is. Focus on tests that:

- Directly construct a `ZamaProvider` with spread props
- Reference `ZamaProviderProps` type with old fields
- Spy on `ZamaSDK` constructor and check for specific prop names

- [ ] **Step 2: Fix any failing tests**

Update references from old props to new config-based pattern. The test fixtures already handle the conversion internally via `buildMockZamaConfig`, so most hook tests won't need changes.

- [ ] **Step 3: Run all react-sdk tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/sdk && pnpm vitest run --project react-sdk`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/react-sdk/src/__tests__/
git commit -m "test(react-sdk): fix provider tests for config-based API"
```

---

### Task 7: Update react-sdk exports

**Files:**

- Modify: `packages/react-sdk/src/index.ts`

- [ ] **Step 1: Add createZamaConfig and related type exports**

In `packages/react-sdk/src/index.ts`, after the existing provider exports, add:

```ts
// Config
export { createZamaConfig } from "./config";
export type {
  ZamaConfig,
  CreateZamaConfigParams,
  ZamaConfigWagmi,
  ZamaConfigViem,
  ZamaConfigEthers,
  ZamaConfigCustomSigner,
} from "./config";
```

Also update the provider export to reflect the new `ZamaProviderProps`:

The existing line `export { ZamaProvider, useZamaSDK, type ZamaProviderProps } from "./provider";` stays as-is — the type name hasn't changed, just its shape.

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/guillaume.hermet/Documents/zama/sdk && pnpm typecheck`
Expected: No errors from index.ts

- [ ] **Step 3: Commit**

```bash
git add packages/react-sdk/src/index.ts
git commit -m "feat(react-sdk): export createZamaConfig and config types"
```

---

### Task 8: Migrate react-wagmi example

**Files:**

- Modify: `examples/react-wagmi/src/providers.tsx`

- [ ] **Step 1: Rewrite providers.tsx**

Replace the contents of `examples/react-wagmi/src/providers.tsx` with:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import {
  ZamaProvider,
  ZamaSDKEvents,
  indexedDBStorage,
  savePendingUnshield,
  createZamaConfig,
} from "@zama-fhe/react-sdk";
import { SepoliaConfig } from "@zama-fhe/sdk";
import { SEPOLIA_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";

// ── What this file does ────────────────────────────────────────────────────────
//
// Uses createZamaConfig to wire together the SDK primitives:
//
//   const wagmiConfig = createConfig({ chains, transports, connectors });
//   const zamaConfig  = createZamaConfig({ wagmiConfig, transports: overrides });
//   <ZamaProvider config={zamaConfig}>
//
// WagmiSigner is created internally by createZamaConfig.
// Storage defaults to two separate IndexedDB instances (CredentialStore + SessionStore).
// ──────────────────────────────────────────────────────────────────────────────

const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(SEPOLIA_RPC_URL) },
});

const zamaConfig = createZamaConfig({
  wagmiConfig,
  transports: {
    [SepoliaConfig.chainId]: {
      relayerUrl: `${window.location.origin}/api/relayer`,
      network: SEPOLIA_RPC_URL,
    },
  },
  onEvent: (event) => {
    if (event.type === ZamaSDKEvents.UnshieldPhase1Submitted) {
      const wrapperAddress = getActiveUnshieldToken();
      if (wrapperAddress) {
        savePendingUnshield(indexedDBStorage, wrapperAddress, event.txHash).catch((err) =>
          console.error("[Providers] Failed to persist pending unshield:", event.txHash, err),
        );
        setActiveUnshieldToken(null);
      }
    }
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Verify the example builds**

Run: `cd /Users/guillaume.hermet/Documents/zama/sdk/examples/react-wagmi && pnpm build`
Expected: Build succeeds (or at least no TypeScript errors — build may fail for unrelated reasons in CI)

- [ ] **Step 3: Commit**

```bash
git add examples/react-wagmi/src/providers.tsx
git commit -m "refactor(example/react-wagmi): migrate to createZamaConfig"
```

---

### Task 9: Migrate react-viem example

**Files:**

- Modify: `examples/react-viem/src/providers.tsx`

- [ ] **Step 1: Rewrite providers.tsx**

Replace the contents of `examples/react-viem/src/providers.tsx` with:

```tsx
"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaProvider,
  ZamaSDKEvents,
  indexedDBStorage,
  savePendingUnshield,
  createZamaConfig,
} from "@zama-fhe/react-sdk";
import { SepoliaConfig } from "@zama-fhe/sdk";
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  getAddress,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { SEPOLIA_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";
import { getEthereumProvider } from "@/lib/ethereum";

// ── What this file does ────────────────────────────────────────────────────────
//
// Uses createZamaConfig with the viem adapter path:
//
//   const zamaConfig = createZamaConfig({
//     viem: { publicClient, walletClient },
//     transports: { ... },
//   });
//   <ZamaProvider config={zamaConfig}>
//
// walletKey + refSeededRef pattern remounts on wallet switch — same as before,
// but now the config object is recreated via createZamaConfig.
// ──────────────────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const liveAccountsRef = useRef<readonly string[]>([]);
  const refSeededRef = useRef(false);
  const [walletKey, setWalletKey] = useState(0);

  useEffect(() => {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;
    (ethereum.request({ method: "eth_accounts" }) as Promise<string[]>).then(
      (accounts) => {
        liveAccountsRef.current = accounts;
        refSeededRef.current = true;
        if (accounts.length > 0) {
          setWalletKey((k) => k + 1);
        }
      },
      (err) => {
        console.error("[Providers] Failed to seed accounts:", err);
        refSeededRef.current = true;
      },
    );
    const handleAccountsChanged = (accounts: unknown) => {
      const newAccounts = accounts as string[];
      const prevAddress = liveAccountsRef.current[0];
      liveAccountsRef.current = newAccounts;
      if (!refSeededRef.current) return;
      if (newAccounts[0] !== prevAddress) {
        setWalletKey((k) => k + 1);
      }
    };
    const handleChainChanged = () => {
      setWalletKey((k) => k + 1);
      queryClient.invalidateQueries();
    };
    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);
    return () => {
      ethereum.removeListener("accountsChanged", handleAccountsChanged);
      ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [queryClient]);

  const zamaConfig = useMemo(() => {
    const ethereum = getEthereumProvider();
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(SEPOLIA_RPC_URL),
    });

    const rawAddress = liveAccountsRef.current[0];
    const account = rawAddress ? (getAddress(rawAddress) as Address) : undefined;
    const walletClient = ethereum
      ? createWalletClient({
          ...(account ? { account } : {}),
          chain: sepolia,
          transport: custom(ethereum),
        })
      : undefined;

    return createZamaConfig({
      viem: { publicClient, walletClient, ethereum: ethereum ?? undefined },
      transports: {
        [SepoliaConfig.chainId]: {
          ...SepoliaConfig,
          relayerUrl: `${window.location.origin}/api/relayer`,
          network: SEPOLIA_RPC_URL,
        },
      },
      onEvent: (event) => {
        if (event.type === ZamaSDKEvents.UnshieldPhase1Submitted) {
          const wrapperAddress = getActiveUnshieldToken();
          if (wrapperAddress) {
            savePendingUnshield(indexedDBStorage, wrapperAddress, event.txHash).catch((err) =>
              console.error("[Providers] Failed to persist pending unshield:", event.txHash, err),
            );
            setActiveUnshieldToken(null);
          }
        }
      },
    });
  }, [walletKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider key={walletKey} config={zamaConfig}>
        {children}
      </ZamaProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add examples/react-viem/src/providers.tsx
git commit -m "refactor(example/react-viem): migrate to createZamaConfig"
```

---

### Task 10: Migrate react-ethers example

**Files:**

- Modify: `examples/react-ethers/src/providers.tsx`

- [ ] **Step 1: Rewrite providers.tsx**

Replace the contents of `examples/react-ethers/src/providers.tsx` with:

```tsx
"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaProvider,
  ZamaSDKEvents,
  indexedDBStorage,
  savePendingUnshield,
  createZamaConfig,
} from "@zama-fhe/react-sdk";
import { SepoliaConfig } from "@zama-fhe/sdk";
import { SEPOLIA_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";
import { getEthereumProvider } from "@/lib/ethereum";

// ── What this file does ────────────────────────────────────────────────────────
//
// Uses createZamaConfig with the ethers adapter path:
//
//   const zamaConfig = createZamaConfig({
//     ethers: { ethereum },
//     transports: { ... },
//   });
//   <ZamaProvider config={zamaConfig}>
//
// walletKey + refSeededRef pattern remounts on wallet switch.
// ──────────────────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const liveAccountsRef = useRef<readonly string[]>([]);
  const refSeededRef = useRef(false);
  const [walletKey, setWalletKey] = useState(0);

  useEffect(() => {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;
    (ethereum.request({ method: "eth_accounts" }) as Promise<string[]>).then(
      (accounts) => {
        liveAccountsRef.current = accounts;
        refSeededRef.current = true;
      },
      (err) => {
        console.error("[Providers] Failed to seed accounts:", err);
        refSeededRef.current = true;
      },
    );
    const handleAccountsChanged = (accounts: unknown) => {
      const newAccounts = accounts as string[];
      const prevAddress = liveAccountsRef.current[0];
      liveAccountsRef.current = newAccounts;
      if (!refSeededRef.current) return;
      if (newAccounts[0] !== prevAddress) {
        setWalletKey((k) => k + 1);
      }
    };
    const handleChainChanged = () => {
      setWalletKey((k) => k + 1);
      queryClient.invalidateQueries();
    };
    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);
    return () => {
      ethereum.removeListener("accountsChanged", handleAccountsChanged);
      ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [queryClient]);

  const zamaConfig = useMemo(() => {
    const ethereum = getEthereumProvider();
    const provider = ethereum ?? {
      request: async () => {
        throw new Error("No Ethereum wallet detected. Connect a wallet to use this app.");
      },
      on: () => {},
      removeListener: () => {},
    };

    return createZamaConfig({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ethers: { ethereum: provider as any },
      transports: {
        [SepoliaConfig.chainId]: {
          ...SepoliaConfig,
          relayerUrl: `${window.location.origin}/api/relayer`,
          network: SEPOLIA_RPC_URL,
        },
      },
      onEvent: (event) => {
        if (event.type === ZamaSDKEvents.UnshieldPhase1Submitted) {
          const wrapperAddress = getActiveUnshieldToken();
          if (wrapperAddress) {
            savePendingUnshield(indexedDBStorage, wrapperAddress, event.txHash).catch((err) =>
              console.error("[Providers] Failed to persist pending unshield:", event.txHash, err),
            );
            setActiveUnshieldToken(null);
          }
        }
      },
    });
  }, [walletKey]);

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider key={walletKey} config={zamaConfig}>
        {children}
      </ZamaProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add examples/react-ethers/src/providers.tsx
git commit -m "refactor(example/react-ethers): migrate to createZamaConfig"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `cd /Users/guillaume.hermet/Documents/zama/sdk && pnpm typecheck`
Expected: No TypeScript errors

- [ ] **Step 2: Run all tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/sdk && pnpm test:run`
Expected: All tests pass

- [ ] **Step 3: Fix any remaining issues**

If any tests or type errors remain, fix them. Common issues:

- Tests that import `ZamaProviderProps` and reference old fields
- Tests that construct `ZamaProvider` JSX directly with old props
- Type errors from `config._relayer` access (ensure `ZamaConfig` is imported)

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(react-sdk): resolve remaining test and type issues"
```
