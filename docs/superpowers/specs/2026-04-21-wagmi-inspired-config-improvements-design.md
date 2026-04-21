# Wagmi-Inspired Config Improvements

**Date:** 2026-04-21
**Status:** Draft
**Scope:** `@zama-fhe/sdk` config system

## Problem

The SDK's `createZamaConfig` has two gaps compared to wagmi's `createConfig`:

1. **No compile-time chain/transport coupling.** `transports` is typed as `Record<number, TransportConfig>` — any number key is accepted. A missing transport for a configured chain is only caught at runtime.

2. **Eager relayer construction.** `buildRelayer` calls every transport handler at config creation time, even for chains the user never interacts with. Most users stay on one chain per session.

## Design

### 1. Type-level chain-transport enforcement

Thread a const generic through the config types so TypeScript rejects missing transport entries at compile time.

#### `chains/types.ts`

```ts
export interface FheChain<TId extends number = number> extends Omit<
  ExtendedFhevmInstanceConfig,
  "chainId"
> {
  readonly id: TId;
}
```

The default `number` preserves backwards compatibility for code that doesn't use literal IDs.

#### `chains/utils.ts`

`toFheChain` currently returns `FheChain` (erasing the literal `chainId`). Update to preserve it:

```ts
export function toFheChain<T extends ExtendedFhevmInstanceConfig>({
  chainId,
  ...config
}: T): FheChain<T["chainId"]> {
  return { ...config, id: chainId } as FheChain<T["chainId"]>;
}
```

This makes preset chains (`mainnet`, `sepolia`, etc.) carry their literal IDs through, which is required for the mapped transport type to work. The preset config objects (e.g. `MainnetConfig`) must also have literal `chainId` types — verify and add `as const` or literal annotations if needed.

#### `config/types.ts`

```ts
export interface ZamaConfigBase<
  TChains extends readonly [FheChain, ...FheChain[]] = readonly [FheChain, ...FheChain[]],
> {
  chains: TChains;
  transports: { [K in TChains[number]["id"]]: TransportConfig };
  // ... rest unchanged
}

export interface ZamaConfigViem<
  TChains extends readonly [FheChain, ...FheChain[]] = readonly [FheChain, ...FheChain[]],
> extends ZamaConfigBase<TChains> {
  viem: { publicClient: PublicClient; walletClient?: WalletClient; ethereum?: EIP1193Provider };
  relayer?: never;
  signer?: never;
  ethers?: never;
}

// Same pattern for ZamaConfigEthers, ZamaConfigCustomSigner

export type CreateZamaConfigBaseParams<
  TChains extends readonly [FheChain, ...FheChain[]] = readonly [FheChain, ...FheChain[]],
> = ZamaConfigViem<TChains> | ZamaConfigEthers<TChains> | ZamaConfigCustomSigner<TChains>;
```

The `readonly [FheChain, ...FheChain[]]` constraint also enforces at least one chain at the type level.

#### `config/index.ts`

```ts
export function createZamaConfig<const TChains extends readonly [FheChain, ...FheChain[]]>(
  params: CreateZamaConfigBaseParams<TChains>,
): ZamaConfig;
```

The `const` modifier preserves literal chain IDs from the call site.

#### User experience

```ts
// Correct — compiles
createZamaConfig({
  chains: [sepolia, mainnet],
  transports: { [sepolia.id]: web(), [mainnet.id]: web() },
  signer,
});

// Error — missing mainnet transport
createZamaConfig({
  chains: [sepolia, mainnet],
  transports: { [sepolia.id]: web() }, // TS error: property 1 is missing
  signer,
});
```

### 2. Lazy relayer initialization

Defer relayer construction from config creation time to first use per chain.

#### Remove `buildRelayer`

`buildRelayer` in `resolve.ts` is deleted. It is also removed from the public API (`config/index.ts` exports). This is a **breaking change** — clean break, no deprecation shim.

#### `CompositeRelayer` changes

The constructor accepts raw config instead of pre-constructed promises:

```ts
class CompositeRelayer implements RelayerSDK {
  readonly #configs: Map<number, ResolvedChainTransport>;
  readonly #resolved = new Map<number, RelayerSDK>();
  readonly #resolveChainId: () => Promise<number>;

  constructor(resolveChainId: () => Promise<number>, configs: Map<number, ResolvedChainTransport>) {
    this.#resolveChainId = resolveChainId;
    this.#configs = new Map(configs);
  }

  async #current(): Promise<RelayerSDK> {
    const chainId = await this.#resolveChainId();

    const cached = this.#resolved.get(chainId);
    if (cached) return cached;

    const config = this.#configs.get(chainId);
    if (!config) {
      throw new ConfigurationError(
        `No relayer configured for chain ${chainId}. ` +
          `Add it to the chains array and transports map.`,
      );
    }

    const handler = relayersMap.get(config.transport.type);
    if (!handler) {
      const hint =
        config.transport.type === "node"
          ? ' Import "@zama-fhe/sdk/node" to enable Node.js transports.'
          : "";
      throw new ConfigurationError(
        `No transport handler registered for type "${config.transport.type}".${hint}`,
      );
    }

    const relayer = await handler(config.chain, config.transport);
    this.#resolved.set(chainId, relayer);
    return relayer;
  }

  // ... delegate methods unchanged
}
```

#### `createZamaConfig` simplification

```ts
export function createZamaConfig<
  const TChains extends readonly [FheChain, ...FheChain[]]
>(params: CreateZamaConfigBaseParams<TChains>): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const signer = resolveSigner(params);
  const chainTransports = resolveChainTransports(
    params.chains as FheChain[],
    params.transports,
    (params.chains as FheChain[]).map((c) => c.id),
  );
  const relayer = new CompositeRelayer(() => signer.getChainId(), chainTransports);

  return { chains: params.chains, relayer, signer, storage, sessionStorage, ... } as unknown as ZamaConfig;
}
```

### What stays unchanged

- Transport factories (`web()`, `node()`, `cleartext()`) — no changes
- Relayer registration system (`registerRelayer`, `relayersMap`) — no changes
- Storage resolution — no changes
- Signer resolution — no changes
- Orphan transport validation in `resolveChainTransports` — stays as a config-time structural check

## Files changed

| File                           | Change                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `chains/types.ts`              | Add `TId` generic to `FheChain`                                                                          |
| `chains/utils.ts`              | Update `toFheChain` return type to preserve literal `chainId`                                            |
| `config/types.ts`              | Add `TChains` generic to all config interfaces                                                           |
| `config/index.ts`              | Add const generic to `createZamaConfig`, remove `buildRelayer` export, pass config to `CompositeRelayer` |
| `config/resolve.ts`            | Delete `buildRelayer` function                                                                           |
| `relayer/composite-relayer.ts` | Accept config map instead of promise map, construct relayers lazily in `#current()`                      |

## Breaking changes

- `buildRelayer` removed from public API. Consumers calling it directly must inline the logic or use `CompositeRelayer` directly.
- `ZamaConfigBase` and variants gain a generic parameter. Existing code using these types without explicit generics is unaffected (defaults to `readonly [FheChain, ...FheChain[]]`).

## Testing

- Existing config tests should pass with no changes (runtime behavior unchanged for correct configs).
- Add a type-level test (using `@ts-expect-error`) confirming that missing transports produce a compile error.
- Verify lazy init by checking that relayer handlers are not called until the first SDK operation.
