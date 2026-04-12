# `createZamaConfig` Design Spec

## Summary

Replace the multi-object manual wiring pattern with a single `createZamaConfig()` factory function inspired by wagmi's `createConfig`. This is a **breaking change** to `ZamaProvider` — the spread-props API is removed in favor of `<ZamaProvider config={zamaConfig}>`.

## Motivation

Current setup requires users to manually instantiate and connect 4+ objects (relayer, signer, storage, sessionStorage), understand storage separation pitfalls, and duplicate chain config across wagmi and the SDK. `createZamaConfig` collapses this into one call with sensible defaults.

## API Surface

### Wagmi path (happy path)

```ts
import { createConfig } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { createZamaConfig } from "@zama-fhe/react-sdk";

const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  transports: { [mainnet.id]: http(), [sepolia.id]: http() },
  connectors: [injected()],
});

const zamaConfig = createZamaConfig({
  wagmiConfig,
  transports: {
    [sepolia.id]: { relayerUrl: `${window.location.origin}/api/relayer` },
  },
  keypairTTL: 86400,
});
```

### Viem path

```ts
const zamaConfig = createZamaConfig({
  viem: { publicClient, walletClient },
  transports: { [sepolia.id]: SepoliaConfig },
});
```

### Ethers path

```ts
const zamaConfig = createZamaConfig({
  ethers: { provider, signer },
  transports: { [sepolia.id]: SepoliaConfig },
});
```

### Custom signer path

```ts
const zamaConfig = createZamaConfig({
  signer: myCustomSigner,
  transports: { [sepolia.id]: SepoliaConfig },
});
```

### Provider usage

```tsx
<WagmiProvider config={wagmiConfig}>
  <QueryClientProvider client={queryClient}>
    <ZamaProvider config={zamaConfig}>
      <App />
    </ZamaProvider>
  </QueryClientProvider>
</WagmiProvider>
```

## Type Definitions

```ts
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
interface ZamaConfigWagmi extends ZamaConfigBase {
  wagmiConfig: Config;
  signer?: never;
  viem?: never;
  ethers?: never;
}

/** Viem path — takes native viem clients. */
interface ZamaConfigViem extends ZamaConfigBase {
  viem: {
    publicClient: PublicClient;
    walletClient?: WalletClient; // optional for read-only mode
  };
  wagmiConfig?: never;
  signer?: never;
  ethers?: never;
  /** Required: at least one chain transport must be provided. */
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}

/** Ethers path — takes native ethers signer/provider. */
interface ZamaConfigEthers extends ZamaConfigBase {
  ethers: {
    provider: Provider;
    signer?: Signer; // optional for read-only mode
  };
  wagmiConfig?: never;
  signer?: never;
  viem?: never;
  /** Required: at least one chain transport must be provided. */
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}

/** Escape hatch — raw GenericSigner for custom implementations. */
interface ZamaConfigCustomSigner extends ZamaConfigBase {
  signer: GenericSigner;
  wagmiConfig?: never;
  viem?: never;
  ethers?: never;
  /** Required: at least one chain transport must be provided. */
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}

type CreateZamaConfigParams =
  | ZamaConfigWagmi
  | ZamaConfigViem
  | ZamaConfigEthers
  | ZamaConfigCustomSigner;
```

### Return type

```ts
/** Opaque config object — pass to <ZamaProvider config={zamaConfig}>. */
interface ZamaConfig {
  /** @internal */ readonly relayer: RelayerWeb;
  /** @internal */ readonly signer: GenericSigner;
  /** @internal */ readonly storage: GenericStorage;
  /** @internal */ readonly sessionStorage: GenericStorage;
  /** @internal */ readonly keypairTTL: number | undefined;
  /** @internal */ readonly sessionTTL: number | "infinite" | undefined;
  /** @internal */ readonly registryAddresses: Record<number, Address> | undefined;
  /** @internal */ readonly registryTTL: number | undefined;
  /** @internal */ readonly onEvent: ZamaSDKEventListener | undefined;
}
```

## Implementation Logic

### 1. Resolve signer

| Path          | Action                                           |
| ------------- | ------------------------------------------------ |
| `wagmiConfig` | `new WagmiSigner({ config: wagmiConfig })`       |
| `viem`        | `new ViemSigner({ publicClient, walletClient })` |
| `ethers`      | `new EthersSigner({ provider, signer })`         |
| `signer`      | Use as-is                                        |

### 2. Resolve transports

**Wagmi path:**

1. Read `wagmiConfig.chains` to get the chain list.
2. For each chain, look up `DefaultConfigs[chainId]`.
3. Merge user overrides: `{ ...DefaultConfigs[chainId], ...params.transports?.[chainId] }`.
4. `console.warn` if a chain has no `DefaultConfigs` entry and no user override (not a hard error — the chain may not need FHE).

**Other paths:**

- Use `params.transports` directly (required by type system).

### 3. Resolve storage

```
storage = params.storage
  ?? (isBrowser ? new IndexedDBStorage("CredentialStore") : new MemoryStorage())

sessionStorage = params.sessionStorage
  ?? (isBrowser ? new IndexedDBStorage("SessionStore") : new MemoryStorage())
```

- `isBrowser`: `typeof window !== "undefined"`
- **Same-reference guard**: if `storage === sessionStorage`, emit `console.warn` explaining the overwrite pitfall.

### 4. Build getChainId

| Path          | Implementation                                   |
| ------------- | ------------------------------------------------ |
| `wagmiConfig` | `() => Promise.resolve(getChainId(wagmiConfig))` |
| Other paths   | `() => signer.getChainId()`                      |

### 5. Create RelayerWeb

```ts
new RelayerWeb({
  getChainId,
  transports: resolvedTransports,
  security: params.security,
  threads: params.threads,
});
```

### 6. Return ZamaConfig

Assemble the opaque config object with all resolved internals.

## ZamaProvider Changes (Breaking)

The old spread-props API is removed. `ZamaProvider` accepts only:

```tsx
interface ZamaProviderProps extends PropsWithChildren {
  config: ZamaConfig;
}
```

Internally, the provider extracts `relayer`, `signer`, `storage`, etc. from `config` and feeds them into `new ZamaSDK(...)` via the existing `useMemo` pattern. Lifecycle management (`dispose()` on unmount, query invalidation on wallet events) remains unchanged.

## Files to Create / Modify

| File                                      | Action                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/react-sdk/src/config.ts`        | **Create** — `createZamaConfig`, types, resolution logic                                     |
| `packages/react-sdk/src/provider.tsx`     | **Modify** — accept `config: ZamaConfig`, remove old spread props                            |
| `packages/react-sdk/src/index.ts`         | **Modify** — export `createZamaConfig`, `ZamaConfig`, `CreateZamaConfigParams` and sub-types |
| `examples/react-wagmi/src/providers.tsx`  | **Modify** — migrate to `createZamaConfig`                                                   |
| `examples/react-viem/src/providers.tsx`   | **Modify** — migrate to `createZamaConfig`                                                   |
| `examples/react-ethers/src/providers.tsx` | **Modify** — migrate to `createZamaConfig`                                                   |

## Testing Strategy

- **Unit tests** for `createZamaConfig`:
  - Wagmi path: verify signer is `WagmiSigner`, transports auto-resolved from chains
  - Viem path: verify signer is `ViemSigner`
  - Ethers path: verify signer is `EthersSigner`
  - Custom signer path: verify signer is passed through
  - Transport merging: override `relayerUrl` only, verify other fields from DefaultConfigs preserved
  - Storage defaults: browser detection, separate instances, same-reference warning
  - Unknown chain warning (wagmi path)
- **Integration tests**: existing E2E tests in `test/playwright/` should pass after example migration
