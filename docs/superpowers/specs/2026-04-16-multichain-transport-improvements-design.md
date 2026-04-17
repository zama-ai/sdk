# Multichain Transport Improvements

**Date**: 2026-04-16
**Branch**: `feat/create-zama-config`
**Scope**: Validation hardening, relayer grouping ergonomics, custom transport variant

## Context

The `createZamaConfig` → `resolveChainTransports` → `buildRelayer` pipeline resolves per-chain transport configs into relayer instances. Three gaps exist:

1. Misconfiguration is silent in two cases (orphaned transport keys, empty relayerUrl with web/node).
2. Relayer instance sharing uses reference identity, which is subtle and error-prone.
3. There is no way to provide a custom `RelayerSDK` for a single chain without bypassing all transport resolution via the top-level `relayer` escape hatch.

## 1. Validation: orphaned transport keys

### Problem

`resolveChainTransports` iterates `chainIds`, not the keys of `transports`. Transport entries for chain IDs not in `chainIds` are silently ignored. A typo in a chain ID produces no error — the transport is just dropped.

### Solution

After the main loop in `resolveChainTransports`, check for transport keys that were not consumed. Throw a `ConfigurationError` listing the orphaned IDs.

```ts
const chainIdSet = new Set(chainIds);
const orphaned = Object.keys(transports ?? {})
  .map(Number)
  .filter((id) => !chainIdSet.has(id));
if (orphaned.length > 0) {
  throw new ConfigurationError(
    `Transport entries for chain(s) [${orphaned.join(", ")}] have no matching entry in the chains array or wagmi config. ` +
      `Remove them or add the corresponding chain config.`,
  );
}
```

### Files

- `packages/sdk/src/config/resolve.ts` — add orphan check at end of `resolveChainTransports`

## 2. Validation: empty relayerUrl guard

### Problem

`HoodiConfig` has `relayerUrl: ""` and is meant for `cleartext()` only. If a user adds it to `chains` without a cleartext transport, it silently gets a web transport with an empty relayerUrl. Every HTTP request fails with an opaque network error.

### Solution

In `buildRelayer`, when constructing web/node entries via `toChainEntry`, validate that the merged chain config has a non-empty `relayerUrl`. Throw if empty.

```ts
function toChainEntry(
  chain: ExtendedFhevmInstanceConfig,
  transport: WebTransportConfig | NodeTransportConfig,
): ChainEntry {
  const merged = { ...chain, ...transport.chain };
  if (!merged.relayerUrl) {
    throw new ConfigurationError(
      `Chain ${chain.chainId} has an empty relayerUrl. ` +
        `Use cleartext() for chains without a relayer.`,
    );
  }
  return { chain: merged, relayer: transport.relayer };
}
```

### Files

- `packages/sdk/src/config/resolve.ts` — add guard in `toChainEntry`

## 3. Relayer grouping: optional relayerKey

### Problem

Chains share a relayer instance only if they pass the same `relayer` options object reference. Two structurally identical `{ threads: 4 }` objects created independently produce two separate relayers. This is surprising and easy to get wrong.

### Solution

Add an optional `relayerKey: string` field to `WebTransportConfig` and `NodeTransportConfig`. Update the factory signatures:

```ts
web(chain?, relayer?, relayerKey?): WebTransportConfig
node(chain?, relayer?, relayerKey?): NodeTransportConfig
```

Update `groupByRelayer` to group by `relayerKey` first (string equality) when present, falling back to reference identity on `relayer` for entries without a key.

If two entries share a `relayerKey` but have structurally different `relayer` options (checked via JSON serialization), throw a `ConfigurationError` — this prevents silent conflicts where two chains claim the same key but configure the relayer differently.

### Example

```ts
transports: {
  [sepolia.id]: web({ relayerUrl: "..." }, { threads: 4 }, "shared"),
  [mainnet.id]: web({ relayerUrl: "..." }, { threads: 4 }, "shared"),
  // ↑ Same relayerKey → shares one RelayerWeb instance
}
```

### Files

- `packages/sdk/src/config/transports.ts` — add `relayerKey` to interfaces and factory signatures
- `packages/sdk/src/config/resolve.ts` — update `groupByRelayer` logic

## 4. Custom transport variant

### Problem

To use a custom `RelayerSDK` implementation for a specific chain, users must use the top-level `relayer` escape hatch (`ZamaConfigCustomRelayer`), which bypasses all transport resolution and forces a single relayer for all chains. There is no way to mix a custom relayer for one chain with standard transports for others.

### Solution

Add a `custom()` transport factory and `CustomTransportConfig` type:

```ts
export interface CustomTransportConfig {
  readonly type: "custom";
  relayer: RelayerSDK;
}

export function custom(relayer: RelayerSDK): CustomTransportConfig {
  return { type: "custom", relayer };
}
```

Update `TransportConfig` union:

```ts
export type TransportConfig =
  | WebTransportConfig
  | NodeTransportConfig
  | CleartextTransportConfig
  | CustomTransportConfig;
```

In `buildRelayer`, handle the `"custom"` case by inserting the relayer directly:

```ts
if (transport.type === "custom") {
  perChainRelayers.set(chain.chainId, transport.relayer);
  continue;
}
```

In `resolveChainTransports`, the `"custom"` type passes through like `"cleartext"` — it requires a chain config entry and is added directly to the result map.

### Example

```ts
transports: {
  [sepolia.id]: web(),
  [mainnet.id]: custom(myCustomRelayer),
  [hardhat.id]: cleartext({ executorAddress: "0x..." }),
}
```

### Files

- `packages/sdk/src/config/transports.ts` — add `CustomTransportConfig`, `custom()` factory, update union
- `packages/sdk/src/config/resolve.ts` — handle `"custom"` in `resolveChainTransports` and `buildRelayer`
- `packages/sdk/src/config/index.ts` — export `custom` and `CustomTransportConfig`
- `packages/sdk/src/index.ts` — re-export from config

## Testing strategy

Each improvement gets direct unit tests in the existing test files:

- `config/__tests__/resolve.test.ts` — orphaned key detection, empty relayerUrl guard, custom transport resolution
- `config/__tests__/transports.test.ts` — `custom()` factory shape, `relayerKey` presence in web/node output
- `relayer/__tests__/composite-relayer.test.ts` — custom relayer dispatch (if it reaches CompositeRelayer)
- `react-sdk/__tests__/config.test.ts` — integration: custom transport in wagmi config path

## Out of scope

- **Dynamic chain addition at runtime** — deferred; can be added later without breaking changes.
- **Config composition / merge utility** — users can spread objects themselves.
- **Chain ID caching in CompositeRelayer** — signer.getChainId() is already fast; not worth the invalidation complexity.
- **Renaming `type` discriminant** — already done in a prior commit.
- **Branding `ZamaConfig` as opaque** — deferred; doesn't affect functionality.
