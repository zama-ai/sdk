# Research: fhevm-provider

**Unit:** fhevm-provider
**Date:** 2026-03-08
**Scope:** Rewrite `packages/react-sdk/src/provider.tsx` to replace `ZamaProvider` with `FhevmProvider`

---

## Objective

Replace the manual-wiring `ZamaProvider` (which requires `relayer`, `signer`, `storage` props) with a
config-driven `FhevmProvider` that accepts only `{ config, queryClient?, children }`. The provider
resolves relayer, wallet adapter, and lifecycle internally.

---

## RFC Specification

**File:** `docs/plans/2026-03-08-config-first-api-design.md`
**Relevant sections:** §3 (Design Decisions), §5 (FhevmProvider), §6 (Wallet), §7 (Worker)

### Key RFC Rules

1. **`FhevmProviderProps`** – accepts only `config: FhevmConfig`, optional `queryClient?: QueryClient`, `children: React.ReactNode`.
2. **Relayer auto-resolution table:**
   | Chain ID | Mode |
   |---|---|
   | `1` (mainnet) | `RelayerWeb` with `MainnetConfig` transport |
   | `11155111` (sepolia) | `RelayerWeb` with `SepoliaConfig` transport |
   | `31337` (hardhat) | `CleartextFhevmInstance(HardhatCleartextConfig)` |
   | `560048` (hoodi) | `CleartextFhevmInstance(hoodiCleartextConfig)` |
   | Unknown | `CleartextFhevmInstance` (default cleartext) |
3. **Override merge:** if `config.relayer` is present, merge its `transports` over the auto-resolved transport for matching chain IDs.
4. **Wallet adapter resolution:**
   - `WagmiAdapter` (`type === 'wagmi'`): call wagmi `useConfig()` hook, construct `WagmiSigner`
   - `GenericSigner`: use directly
   - `undefined`: construct read-only `ViemSigner` using `createPublicClient` with chain's RPC URL, no walletClient
5. **Advanced options:**
   - `threads` → `RelayerWebConfig.threads`
   - `keypairTTL`, `sessionTTL`, `onEvent` → `ZamaSDKConfig`
   - `integrityCheck` → `RelayerWebConfig.security.integrityCheck`
6. **Lifecycle:**
   - On unmount: call `sdk.dispose()` + `relayer.terminate()`
   - On `config` reference change: re-instantiate relayer and SDK
7. **`useFhevmClient()` hook:** reads from context, throws clear error if called outside `FhevmProvider`
8. **Clean break:** remove `ZamaProvider` and `useZamaSDK` exports entirely

---

## Existing Implementation

### `provider.tsx` (current — to be replaced)

**Path:** `packages/react-sdk/src/provider.tsx`

Current `ZamaProvider`:

- Accepts `relayer`, `signer`, `storage`, `sessionStorage`, `keypairTTL`, `sessionTTL`, `onEvent`
- Creates `ZamaSDK` via `useMemo`
- Stabilizes `onEvent` via `useRef`
- Sets up `signerLifecycleCallbacks` for query invalidation
- On unmount: calls `sdk.dispose()` (NOT `relayer.terminate()` — caller owns relayer in current design)
- Exposes context via `ZamaSDKContext`

Key patterns to **preserve**:

- `onEvent` ref stabilization (avoid SDK recreation on inline arrow functions)
- `signerLifecycleCallbacks` wiring for `invalidateWalletLifecycleQueries`
- `useQueryClient()` for query invalidation

Key patterns to **change**:

- Provider now owns the relayer → must call `relayer.terminate()` on unmount
- Relayer must be created inside the provider (via `useMemo`), not passed as prop
- Wallet resolution is internal (wagmi `useConfig()` hook if WagmiAdapter)

---

## Config Types (already implemented)

**Path:** `packages/react-sdk/src/config.ts`

```ts
interface FhevmConfig {
  chains: FhevmChain[];
  wallet?: WalletOption; // GenericSigner | WagmiAdapter | undefined
  relayer?: RelayerOverride; // { transports: Record<number, Partial<FhevmInstanceConfig>> }
  storage: GenericStorage; // defaults to memoryStorage
  advanced?: FhevmAdvancedOptions; // { threads?, keypairTTL?, sessionTTL?, onEvent?, integrityCheck? }
}
```

**Path:** `packages/sdk/src/chains/index.ts` (via `@zama-fhe/sdk/chains`)

```ts
interface FhevmChain {
  id: number;
  name: string;
}
export const fhevmMainnet: FhevmChain; // id: 1
export const fhevmSepolia: FhevmChain; // id: 11155111
export const fhevmHardhat: FhevmChain; // id: 31337
```

**Note:** `FhevmChain` does NOT have an `rpcUrl` field. For read-only ViemSigner on unknown chains,
the RPC URL must come from the `network` field in cleartext configs or from a preset. For known chains
(mainnet/sepolia), the preset configs (`MainnetConfig.network`, `SepoliaConfig.network`) contain the
RPC URL. Unknown chains with no RPC info are edge-case — may need `FhevmChain` to optionally expose rpcUrl,
or cleartext configs encode the network URL.

---

## Relayer Classes

### `RelayerWeb`

**Path:** `packages/sdk/src/relayer/relayer-web.ts`
**Import:** `import { RelayerWeb } from "@zama-fhe/sdk"`

```ts
new RelayerWeb({
  transports: Record<number, Partial<FhevmInstanceConfig>>,
  getChainId: () => Promise<number>,
  security?: { integrityCheck?: boolean, getCsrfToken?: () => string },
  threads?: number,
  // ...
})
```

Used for chains 1 (mainnet) and 11155111 (sepolia).

### `CleartextFhevmInstance`

**Path:** `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts`
**Import:** `import { CleartextFhevmInstance } from "@zama-fhe/sdk/cleartext"`

```ts
new CleartextFhevmInstance(config: CleartextConfig)

interface CleartextConfig {
  chainId: number;
  network: EIP1193Provider | string;  // RPC URL for the chain
  gatewayChainId: number;
  aclContractAddress: Address;
  verifyingContractAddressDecryption: Address;
  verifyingContractAddressInputVerification: Address;
  cleartextExecutorAddress: Address;
}
```

**Presets:**

- `HardhatCleartextConfig` — chainId 31337, network `http://127.0.0.1:8545`
- `hoodiCleartextConfig` — chainId 560048, network `https://rpc.hoodi.ethpandaops.io`

**Path for presets:** `packages/sdk/src/relayer/cleartext/presets.ts`
**Import:** `import { HardhatCleartextConfig, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext"`

---

## RelayerWeb Transport Presets

**Path:** `packages/sdk/src/relayer/relayer-utils.ts`
**Import:** `import { MainnetConfig, SepoliaConfig, HardhatConfig } from "@zama-fhe/sdk"`

```ts
const MainnetConfig: FhevmInstanceConfig = {
  chainId: 1,
  relayerUrl: "https://relayer.mainnet.zama.org/v2",
  network: "https://ethereum-rpc.publicnode.com", // ← rpcUrl for read-only signer
  // ...
};

const SepoliaConfig: FhevmInstanceConfig = {
  chainId: 11155111,
  relayerUrl: "https://relayer.testnet.zama.org/v2",
  network: "https://ethereum-sepolia-rpc.publicnode.com", // ← rpcUrl for read-only signer
  // ...
};
```

**Key:** `FhevmInstanceConfig.network` contains the RPC URL string, usable for `createPublicClient`.

---

## Wallet Signers

### `WagmiSigner`

**Path:** `packages/react-sdk/src/wagmi/wagmi-signer.ts`
**Import:** `import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi"`

```ts
new WagmiSigner({ config: wagmiConfig }); // wagmiConfig from useConfig()
```

Implements full `GenericSigner` + `subscribe()` for lifecycle events.

### `ViemSigner`

**Path:** `packages/sdk/src/viem/viem-signer.ts`
**Import:** `import { ViemSigner } from "@zama-fhe/sdk/viem"`

```ts
new ViemSigner({
  walletClient?: WalletClient,  // omit for read-only
  publicClient: PublicClient,
  ethereum?: EIP1193Provider,
})
```

For read-only mode (no wallet), construct with just `publicClient`:

```ts
new ViemSigner({
  publicClient: createPublicClient({
    chain: chainDef, // viem chain object
    transport: http(rpcUrl),
  }),
});
```

---

## ZamaSDK

**Path:** `packages/sdk/src/token/zama-sdk.ts`
**Import:** `import { ZamaSDK } from "@zama-fhe/sdk"`

```ts
new ZamaSDK({
  relayer: RelayerSDK,
  signer: GenericSigner,
  storage: GenericStorage,
  sessionStorage?: GenericStorage,
  keypairTTL?: number,
  sessionTTL?: number,
  onEvent?: ZamaSDKEventListener,
  signerLifecycleCallbacks?: SignerLifecycleCallbacks,
})
```

Lifecycle:

- `sdk.dispose()` — unsubscribes signer, idempotent (safe to call on every config change)
- `sdk.terminate()` — calls `dispose()` + `relayer.terminate()`

**Important:** In `FhevmProvider`, the provider owns the relayer, so we should call `sdk.terminate()`
on unmount (which terminates both signer subscriptions AND the relayer), unlike the old `ZamaProvider`
which only called `sdk.dispose()` (caller owned the relayer).

---

## Wagmi Context Hook

```ts
import { useConfig } from "wagmi";

// Inside FhevmProvider, when wallet is WagmiAdapter:
const wagmiConfig = useConfig();
const signer = new WagmiSigner({ config: wagmiConfig });
```

`useConfig` from wagmi returns the current wagmi `Config` object.

---

## Provider Implementation Strategy

```tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConfig } from "wagmi"; // optional peer dep — only called if WagmiAdapter
import { ZamaSDK, RelayerWeb } from "@zama-fhe/sdk";
import { MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
import {
  CleartextFhevmInstance,
  HardhatCleartextConfig,
  hoodiCleartextConfig,
} from "@zama-fhe/sdk/cleartext";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { createPublicClient, http } from "viem";
import { WagmiSigner } from "./wagmi/wagmi-signer";
import type { FhevmConfig } from "./config";

export interface FhevmProviderProps {
  config: FhevmConfig;
  queryClient?: QueryClient;
  children: React.ReactNode;
}

const FhevmClientContext = createContext<ZamaSDK | null>(null);

export function FhevmProvider({ config, children }: FhevmProviderProps) {
  const queryClient = useQueryClient();
  const onEventRef = useRef(config.advanced?.onEvent);
  useEffect(() => {
    onEventRef.current = config.advanced?.onEvent;
  });

  // Resolve wallet (wagmi requires React hook)
  const wagmiConfig = config.wallet?.type === "wagmi" ? useConfig() : null;
  // NOTE: actual impl needs to follow rules of hooks — can't call conditionally
  // Real pattern: always call useConfig() inside a sub-component or use a
  // conditional hook-safe pattern

  const relayer = useMemo(() => resolveRelayer(config), [config]);
  const signer = useMemo(() => resolveWallet(config, wagmiConfig), [config, wagmiConfig]);

  const sdk = useMemo(
    () =>
      new ZamaSDK({
        relayer,
        signer,
        storage: config.storage,
        keypairTTL: config.advanced?.keypairTTL,
        sessionTTL: config.advanced?.sessionTTL,
        onEvent: (...args) => onEventRef.current?.(...args),
        signerLifecycleCallbacks: {
          /* invalidateWalletLifecycleQueries */
        },
      }),
    [relayer, signer, config.storage, config.advanced?.keypairTTL, config.advanced?.sessionTTL],
  );

  // terminate on unmount — provider owns relayer
  useEffect(() => () => sdk.terminate(), [sdk]);

  return <FhevmClientContext.Provider value={sdk}>{children}</FhevmClientContext.Provider>;
}

export function useFhevmClient(): ZamaSDK {
  const ctx = useContext(FhevmClientContext);
  if (!ctx)
    throw new Error(
      "useFhevmClient must be used within a <FhevmProvider>. Wrap your component tree in <FhevmProvider config={config}>.",
    );
  return ctx;
}
```

---

## Critical Implementation Detail: Wagmi Conditional Hook

The `wagmi` peer dep is optional. `useConfig()` must be called unconditionally (Rules of Hooks).
The solution pattern used elsewhere in the SDK:

**Approach 1: Render-time guard in a sub-component**
Split into `FhevmProvider` (outer shell) and `FhevmProviderInner` (where `useConfig()` is always called)
but only render `FhevmProviderInner` when `config.wallet?.type === 'wagmi'`.

**Approach 2: Nullish-safe unconditional call**
Always call `useConfig()` but treat the result as optional. Wrap in try/catch or provide a
stub context if wagmi is not installed.

The wagmi compat module at `packages/react-sdk/src/wagmi/compat.ts` shows precedent for
conditional compatibility patterns.

---

## Index.ts Changes

**Path:** `packages/react-sdk/src/index.ts`

**Remove:**

```ts
export { ZamaProvider, useZamaSDK, type ZamaProviderProps } from "./provider";
```

**Add:**

```ts
export { FhevmProvider, useFhevmClient, type FhevmProviderProps } from "./provider";
```

---

## Test Fixtures Impact

**Path:** `packages/react-sdk/src/test-fixtures.tsx`

The fixture `Providers` component wraps `ZamaProvider`. This will need updating to either:

1. Create an `FhevmProvider`-based fixture (using `createFhevmConfig` with mocks)
2. Keep the old fixture for backward compat during migration (but spec says clean break)

The `createWrapper` fixture exposes `ZamaProviderProps` — needs to be updated to `FhevmProviderProps` or
tests need to be restructured with mock relayer/signer injection via `createFhevmConfig`.

---

## Existing Tests to Update

- `packages/react-sdk/src/__tests__/provider.test.tsx` — tests `ZamaProvider`/`useZamaSDK`, must be rewritten for `FhevmProvider`/`useFhevmClient`
- All tests using `renderWithProviders` / `createWrapper` fixtures that depend on `ZamaProvider`

---

## New Tests to Add

Per the unit spec, include tests covering:

1. **Relayer resolution paths:**
   - Chain 1 → `RelayerWeb` with `MainnetConfig`
   - Chain 11155111 → `RelayerWeb` with `SepoliaConfig`
   - Chain 31337 → `CleartextFhevmInstance` with `HardhatCleartextConfig`
   - Chain 560048 → `CleartextFhevmInstance` with `hoodiCleartextConfig`
   - Unknown chain → `CleartextFhevmInstance`
2. **Relayer override merging** — user transport overrides merged over auto-resolved transport
3. **Read-only mode** — `wallet: undefined` creates `ViemSigner` without `walletClient`
4. **WagmiAdapter** — resolves via `useConfig()` + `WagmiSigner`
5. **Lifecycle** — `terminate()` called on unmount; SDK re-created on `config` reference change
6. **`useFhevmClient()` outside provider** — throws clear error

---

## Open Questions

1. **`FhevmChain` lacks `rpcUrl`** — for read-only ViemSigner on unknown chains, how is the RPC URL
   determined? The preset configs have `network` (string URL), but `FhevmChain` only has `id` and `name`.
   Options: (a) require known chains only for read-only (use preset `network` URL), (b) extend
   `FhevmChain` with optional `rpcUrl`, (c) silently skip `publicClient` for unknown chains without an RPC.

2. **Conditional wagmi hook** — `useConfig()` from wagmi is optional peer dep. Need to handle the case
   where wagmi is not installed (or no `WagmiProvider` in tree) without crashing. Consider try/catch
   or a two-component pattern.

3. **`queryClient` prop on `FhevmProvider`** — the spec mentions an optional `queryClient?: QueryClient`
   prop. The current `ZamaProvider` calls `useQueryClient()` which reads from ambient `QueryClientProvider`.
   If `queryClient` prop is provided, it should take precedence. May need `QueryClientProvider` wrapping.

4. **Test fixture migration** — should `test-fixtures.tsx` be updated to use `FhevmProvider` directly,
   or should tests use lower-level mocking? The existing fixture exposes raw `relayer`/`signer` which
   is no longer the public API.

5. **`hoodiCleartextConfig` export path** — currently in `presets.ts` under cleartext. Confirm it is
   exported from `@zama-fhe/sdk/cleartext` public surface.

---

## File Reference Summary

| File                                                             | Purpose                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `packages/react-sdk/src/provider.tsx`                            | **TARGET** — rewrite this                                   |
| `packages/react-sdk/src/index.ts`                                | Update exports (add `FhevmProvider`, remove `ZamaProvider`) |
| `packages/react-sdk/src/config.ts`                               | `FhevmConfig`, `WagmiAdapter`, `RelayerOverride` types      |
| `packages/react-sdk/src/wagmi/wagmi-signer.ts`                   | `WagmiSigner` class                                         |
| `packages/react-sdk/src/wagmi/adapter.ts`                        | `wagmiAdapter()` factory                                    |
| `packages/react-sdk/src/wagmi/compat.ts`                         | wagmi version compat                                        |
| `packages/react-sdk/src/test-fixtures.tsx`                       | Test fixtures (need update)                                 |
| `packages/react-sdk/src/__tests__/provider.test.tsx`             | Existing provider tests (rewrite)                           |
| `packages/sdk/src/chains/index.ts`                               | `FhevmChain`, chain presets                                 |
| `packages/sdk/src/relayer/relayer-web.ts`                        | `RelayerWeb` class                                          |
| `packages/sdk/src/relayer/relayer-sdk.types.ts`                  | `RelayerWebConfig` type                                     |
| `packages/sdk/src/relayer/relayer-utils.ts`                      | `MainnetConfig`, `SepoliaConfig`, `HardhatConfig`           |
| `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts` | `CleartextFhevmInstance`                                    |
| `packages/sdk/src/relayer/cleartext/presets.ts`                  | `HardhatCleartextConfig`, `hoodiCleartextConfig`            |
| `packages/sdk/src/relayer/cleartext/types.ts`                    | `CleartextConfig` type                                      |
| `packages/sdk/src/token/zama-sdk.ts`                             | `ZamaSDK` class + `ZamaSDKConfig`                           |
| `packages/sdk/src/viem/viem-signer.ts`                           | `ViemSigner` class                                          |
| `docs/plans/2026-03-08-config-first-api-design.md`               | RFC spec                                                    |
