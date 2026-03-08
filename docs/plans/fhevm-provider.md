# Plan: FhevmProvider, Relayer Auto-Resolution, and useFhevmClient

**Unit:** fhevm-provider
**Date:** 2026-03-08
**Category:** large

---

## Overview

Replace `ZamaProvider` (manual-wiring: `relayer`, `signer`, `storage` props) with a config-driven
`FhevmProvider` that accepts `{ config: FhevmConfig; queryClient?: QueryClient; children }`. The
provider auto-resolves relayer type from chain ID, resolves wallet adapter (wagmi/generic/read-only),
wires advanced options, and manages lifecycle (terminate on unmount, re-instantiate on config change).

**Clean break** — `ZamaProvider` and `useZamaSDK` are removed from the public API.

---

## TDD Applicability

**TDD applies.** This work:

- Introduces a new public API (`FhevmProvider`, `useFhevmClient`)
- Adds new code paths (relayer resolution table, wallet adapter resolution, read-only mode)
- Changes lifecycle behavior (provider now owns relayer → `terminate()` on unmount)
- Removes existing public API (`ZamaProvider`, `useZamaSDK`)

Tests must cover resolution paths, lifecycle, error messages, and the clean break.

---

## Step-by-Step Plan

### Phase 1: Extract Relayer Resolution Logic (Pure Function — Test First)

#### Step 1.1 — Write tests for `resolveRelayer(config)`

**File:** `packages/react-sdk/src/__tests__/resolve-relayer.test.ts`

Test cases:

1. Chain ID `1` → returns `RelayerWeb` constructed with `MainnetConfig` transport
2. Chain ID `11155111` → returns `RelayerWeb` constructed with `SepoliaConfig` transport
3. Chain ID `31337` → returns `CleartextFhevmInstance` with `HardhatCleartextConfig`
4. Chain ID `560048` → returns `CleartextFhevmInstance` with `hoodiCleartextConfig`
5. Unknown chain ID (e.g. `999`) → returns `CleartextFhevmInstance` (default)
6. Override: `config.relayer.transports` with chain 11155111 → merged transport replaces auto-resolved
7. `config.advanced.threads` → forwarded to `RelayerWeb` config
8. `config.advanced.integrityCheck` → forwarded to `RelayerWeb.security.integrityCheck`

**Strategy:** Mock `RelayerWeb` and `CleartextFhevmInstance` constructors. Assert constructor args.

#### Step 1.2 — Implement `resolveRelayer(config)`

**File:** `packages/react-sdk/src/resolve-relayer.ts`

```ts
import type { RelayerSDK } from "@zama-fhe/sdk";
import { RelayerWeb, MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
import {
  CleartextFhevmInstance,
  HardhatCleartextConfig,
  hoodiCleartextConfig,
} from "@zama-fhe/sdk/cleartext";
import type { FhevmConfig } from "./config";

export function resolveRelayer(config: FhevmConfig): RelayerSDK {
  const chainId = config.chains[0]!.id;
  const overrideTransports = config.relayer?.transports;

  switch (chainId) {
    case 1:
    case 11155111: {
      const preset = chainId === 1 ? MainnetConfig : SepoliaConfig;
      const transports: Record<number, typeof preset> = { [chainId]: preset };
      if (overrideTransports?.[chainId]) {
        transports[chainId] = { ...preset, ...overrideTransports[chainId] };
      }
      return new RelayerWeb({
        transports,
        getChainId: async () => chainId,
        threads: config.advanced?.threads,
        security:
          config.advanced?.integrityCheck != null
            ? { integrityCheck: config.advanced.integrityCheck }
            : undefined,
      });
    }
    case 31337:
      return new CleartextFhevmInstance(HardhatCleartextConfig);
    case 560048:
      return new CleartextFhevmInstance(hoodiCleartextConfig);
    default:
      return new CleartextFhevmInstance(HardhatCleartextConfig);
  }
}
```

#### Step 1.3 — Write tests for `resolveWallet(config, wagmiConfig?)`

**File:** `packages/react-sdk/src/__tests__/resolve-wallet.test.ts`

Test cases:

1. `config.wallet` is a `GenericSigner` → returned directly
2. `config.wallet` is `WagmiAdapter` + `wagmiConfig` provided → `WagmiSigner` constructed
3. `config.wallet` is `undefined` → `ViemSigner` with `publicClient` only (read-only), using
   first chain's preset RPC URL
4. Read-only signer has no `walletClient` property set

#### Step 1.4 — Implement `resolveWallet(config, wagmiConfig?)`

**File:** `packages/react-sdk/src/resolve-wallet.ts`

```ts
import type { GenericSigner } from "@zama-fhe/sdk";
import { MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { HardhatCleartextConfig, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { createPublicClient, http } from "viem";
import { WagmiSigner } from "./wagmi/wagmi-signer";
import type { FhevmConfig, WagmiAdapter } from "./config";
import type { Config as WagmiConfig } from "wagmi";

const RPC_BY_CHAIN: Record<number, string> = {
  1: MainnetConfig.network as string,
  11155111: SepoliaConfig.network as string,
  31337: HardhatCleartextConfig.network as string,
  560048: hoodiCleartextConfig.network as string,
};

function isWagmiAdapter(wallet: unknown): wallet is WagmiAdapter {
  return typeof wallet === "object" && wallet !== null && (wallet as WagmiAdapter).type === "wagmi";
}

export function resolveWallet(config: FhevmConfig, wagmiConfig: WagmiConfig | null): GenericSigner {
  const wallet = config.wallet;

  if (wallet && !isWagmiAdapter(wallet)) {
    return wallet as GenericSigner;
  }

  if (wallet && isWagmiAdapter(wallet)) {
    if (!wagmiConfig) {
      throw new Error("WagmiAdapter requires a WagmiProvider in the component tree.");
    }
    return new WagmiSigner({ config: wagmiConfig });
  }

  // Read-only: no wallet
  const chainId = config.chains[0]!.id;
  const rpcUrl = RPC_BY_CHAIN[chainId];
  if (!rpcUrl) {
    throw new Error(
      `No RPC URL known for chain ${chainId}. Provide a wallet or use a known chain.`,
    );
  }
  return new ViemSigner({
    publicClient: createPublicClient({ transport: http(rpcUrl) }),
  });
}
```

### Phase 2: FhevmProvider Component

#### Step 2.1 — Write provider tests

**File:** `packages/react-sdk/src/__tests__/provider.test.tsx` (rewrite)

Test cases:

1. `FhevmProvider` renders children without errors (chain 11155111 + wagmi adapter)
2. `useFhevmClient()` returns a `ZamaSDK` instance inside `FhevmProvider`
3. `useFhevmClient()` throws descriptive error outside `FhevmProvider`
4. Omitting `wallet` → read-only mode (ViemSigner, write hooks throw "No wallet connected")
5. Chain 11155111 → `RelayerWeb` instantiated (mock-verify constructor call)
6. Chain 31337 → `CleartextFhevmInstance` with `HardhatCleartextConfig`
7. Chain 560048 → `CleartextFhevmInstance` with `hoodiCleartextConfig`
8. Relayer override merging: `config.relayer.transports` replaces auto-resolved URL
9. `sdk.terminate()` called on unmount (provider owns relayer)
10. `onEvent` forwarded to ZamaSDK
11. `keypairTTL`, `sessionTTL` forwarded to ZamaSDK
12. Query invalidation on signer lifecycle change (preserve existing behavior)

#### Step 2.2 — Implement `FhevmProvider` and `useFhevmClient`

**File:** `packages/react-sdk/src/provider.tsx` (rewrite)

Key design decisions:

- **Wagmi hook compliance**: Use a two-component pattern. `FhevmProvider` is the outer shell that
  conditionally renders `WagmiFhevmProviderInner` (calls `useConfig()`) or `FhevmProviderInner`
  (no wagmi). This avoids conditional hook calls.
- **Provider owns relayer**: `useEffect` cleanup calls `sdk.terminate()` (not just `dispose()`).
- **`onEvent` ref stabilization**: Preserved from current impl.
- **`signerLifecycleCallbacks`**: Preserved — calls `invalidateWalletLifecycleQueries`.
- **Context**: `FhevmClientContext` replaces `ZamaSDKContext`.

```tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ZamaSDK } from "@zama-fhe/sdk";
import { invalidateWalletLifecycleQueries } from "@zama-fhe/sdk/query";
import type { FhevmConfig } from "./config";
import { resolveRelayer } from "./resolve-relayer";
import { resolveWallet } from "./resolve-wallet";

export interface FhevmProviderProps {
  config: FhevmConfig;
  queryClient?: QueryClient;
  children: React.ReactNode;
}

const FhevmClientContext = createContext<ZamaSDK | null>(null);

export function FhevmProvider({
  config,
  queryClient: queryClientProp,
  children,
}: FhevmProviderProps) {
  // Delegate to wagmi-aware or wagmi-free inner component
  if (config.wallet?.type === "wagmi") {
    // Dynamic import pattern or conditional render
    return (
      <WagmiFhevmProviderInner config={config} queryClient={queryClientProp}>
        {children}
      </WagmiFhevmProviderInner>
    );
  }
  return (
    <FhevmProviderInner config={config} wagmiConfig={null} queryClient={queryClientProp}>
      {children}
    </FhevmProviderInner>
  );
}

// Inner component that always calls useConfig() from wagmi
function WagmiFhevmProviderInner(props: FhevmProviderProps) {
  const { useConfig } = require("wagmi"); // lazy require — wagmi is optional peer dep
  const wagmiConfig = useConfig();
  return <FhevmProviderInner {...props} wagmiConfig={wagmiConfig} />;
}

// Core inner component — no conditional hooks
function FhevmProviderInner({
  config,
  wagmiConfig,
  queryClient: queryClientProp,
  children,
}: FhevmProviderProps & { wagmiConfig: unknown }) {
  const defaultQueryClient = useQueryClient();
  const queryClient = queryClientProp ?? defaultQueryClient;

  const onEventRef = useRef(config.advanced?.onEvent);
  useEffect(() => {
    onEventRef.current = config.advanced?.onEvent;
  });

  const relayer = useMemo(() => resolveRelayer(config), [config]);
  const signer = useMemo(() => resolveWallet(config, wagmiConfig), [config, wagmiConfig]);

  const signerLifecycleCallbacks = useMemo(
    () =>
      signer?.subscribe
        ? {
            onDisconnect: () => invalidateWalletLifecycleQueries(queryClient),
            onAccountChange: () => invalidateWalletLifecycleQueries(queryClient),
            onChainChange: () => invalidateWalletLifecycleQueries(queryClient),
          }
        : undefined,
    [queryClient, signer],
  );

  const sdk = useMemo(
    () =>
      new ZamaSDK({
        relayer,
        signer,
        storage: config.storage,
        keypairTTL: config.advanced?.keypairTTL,
        sessionTTL: config.advanced?.sessionTTL,
        onEvent: (...args) => onEventRef.current?.(...args),
        signerLifecycleCallbacks,
      }),
    [
      relayer,
      signer,
      config.storage,
      config.advanced?.keypairTTL,
      config.advanced?.sessionTTL,
      signerLifecycleCallbacks,
    ],
  );

  // Provider owns relayer → terminate both SDK and relayer on unmount
  useEffect(() => () => sdk.terminate(), [sdk]);

  return <FhevmClientContext.Provider value={sdk}>{children}</FhevmClientContext.Provider>;
}

export function useFhevmClient(): ZamaSDK {
  const ctx = useContext(FhevmClientContext);
  if (!ctx) {
    throw new Error(
      "useFhevmClient must be used within a <FhevmProvider>. " +
        "Wrap your component tree in <FhevmProvider config={config}>.",
    );
  }
  return ctx;
}
```

### Phase 3: Update Exports

#### Step 3.1 — Update `index.ts`

**File:** `packages/react-sdk/src/index.ts`

- Remove: `export { ZamaProvider, useZamaSDK, type ZamaProviderProps } from "./provider";`
- Add: `export { FhevmProvider, useFhevmClient, type FhevmProviderProps } from "./provider";`

### Phase 4: Update Test Fixtures

#### Step 4.1 — Rewrite `test-fixtures.tsx`

**File:** `packages/react-sdk/src/test-fixtures.tsx`

- Replace `ZamaProvider` / `ZamaProviderProps` with `FhevmProvider` / `FhevmProviderProps`
- `createWrapper` now accepts `Partial<FhevmProviderProps>` and builds a `FhevmConfig` from
  the fixture's `relayer`, `signer`, `storage` (via `createFhevmConfig`)
- All existing hooks tests that use `renderWithProviders` should work after fixture update

#### Step 4.2 — Update all tests importing from old fixtures

Grep for `ZamaProvider`, `useZamaSDK`, `ZamaProviderProps` across react-sdk tests and update.

### Phase 5: Typecheck and Verify

#### Step 5.1 — Run `pnpm run typecheck`

Ensure zero TypeScript errors.

#### Step 5.2 — Run `pnpm test` on react-sdk

Ensure all tests pass.

---

## Files to Create

| File                                                       | Purpose                                      |
| ---------------------------------------------------------- | -------------------------------------------- |
| `packages/react-sdk/src/resolve-relayer.ts`                | Pure function: chain ID → relayer instance   |
| `packages/react-sdk/src/resolve-wallet.ts`                 | Pure function: wallet config → GenericSigner |
| `packages/react-sdk/src/__tests__/resolve-relayer.test.ts` | Unit tests for relayer resolution            |
| `packages/react-sdk/src/__tests__/resolve-wallet.test.ts`  | Unit tests for wallet resolution             |

## Files to Modify

| File                                                 | Change                                           |
| ---------------------------------------------------- | ------------------------------------------------ |
| `packages/react-sdk/src/provider.tsx`                | Full rewrite: `FhevmProvider` + `useFhevmClient` |
| `packages/react-sdk/src/index.ts`                    | Swap exports: `ZamaProvider` → `FhevmProvider`   |
| `packages/react-sdk/src/test-fixtures.tsx`           | Update to use `FhevmProvider`                    |
| `packages/react-sdk/src/__tests__/provider.test.tsx` | Full rewrite: test new provider                  |

---

## Risks and Mitigations

| Risk                                            | Impact                                                      | Mitigation                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wagmi conditional hook**                      | React Rules of Hooks violation                              | Two-component pattern: `WagmiFhevmProviderInner` always calls `useConfig()`, only rendered when wallet is WagmiAdapter                                         |
| **Wagmi not installed**                         | Runtime crash on `require("wagmi")`                         | `WagmiFhevmProviderInner` only rendered when `config.wallet.type === "wagmi"`, so wagmi is guaranteed to be available. Add try/catch with clear error message. |
| **Unknown chain read-only mode**                | `FhevmChain` has no `rpcUrl`                                | Maintain `RPC_BY_CHAIN` lookup table for known chains. Throw clear error for unknown chains without RPC.                                                       |
| **Test fixture cascade**                        | All 40+ hook tests depend on `test-fixtures.tsx`            | The fixture internally creates `FhevmConfig` from same mock primitives, so hook tests don't need individual changes                                            |
| **`sdk.terminate()` vs `sdk.dispose()`**        | Double-terminating relayer if consumer also calls terminate | Document that provider owns the lifecycle. `terminate()` is idempotent in the SDK.                                                                             |
| **`CleartextFhevmInstance` for unknown chains** | Unknown chain may not have cleartext contracts              | This is the RFC-specified default. Unknown chains are test/dev scenarios.                                                                                      |

---

## Acceptance Criteria Verification

| #   | Criterion                                                                       | How Verified            |
| --- | ------------------------------------------------------------------------------- | ----------------------- |
| 1   | FhevmProvider renders with `{ chains: [fhevmSepolia], wallet: wagmiAdapter() }` | Test 2.1.1              |
| 2   | Omitting wallet → write hooks throw "No wallet connected"                       | Test 2.1.4              |
| 3   | Chain 11155111 → RelayerWeb                                                     | Test 1.1.2 + Test 2.1.5 |
| 4   | Chain 31337 → CleartextFhevmInstance + HardhatCleartextConfig                   | Test 1.1.3 + Test 2.1.6 |
| 5   | Chain 560048 → CleartextFhevmInstance + hoodiCleartextConfig                    | Test 1.1.4 + Test 2.1.7 |
| 6   | Relayer override merges transports                                              | Test 1.1.6 + Test 2.1.8 |
| 7   | useFhevmClient returns ZamaSDK inside provider                                  | Test 2.1.2              |
| 8   | useFhevmClient throws outside provider                                          | Test 2.1.3              |
| 9   | ZamaProvider no longer exported                                                 | Step 3.1 + typecheck    |
| 10  | useZamaSDK no longer exported                                                   | Step 3.1 + typecheck    |
| 11  | TypeScript compilation passes                                                   | Step 5.1                |
