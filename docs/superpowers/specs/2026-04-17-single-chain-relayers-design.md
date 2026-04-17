# Single-Chain RelayerWeb/RelayerNode

**Date**: 2026-04-17
**Branch**: `feat/create-zama-config`

## Context

`RelayerWeb` and `RelayerNode` currently accept a multi-chain config (`transports: Record<number, ...>` + `getChainId: () => Promise<number>`) and handle chain switching internally via promise locks and teardown/re-init. Now that `createZamaConfig` + `CompositeRelayer` handle multi-chain orchestration externally, each relayer instance only ever serves one chain. The multi-chain machinery inside the relayers is dead weight.

## Goal

Make `RelayerWeb` and `RelayerNode` single-chain: one chain config in, one relayer out. Remove internal chain-switching logic. Multi-chain stays in `CompositeRelayer`.

## Changes

### 1. RelayerWebConfig

Replace:

```ts
interface RelayerWebConfig {
  transports: Record<number, Partial<FhevmInstanceConfig>>;
  getChainId: () => Promise<number>;
  security?: RelayerWebSecurityConfig;
  logger?: GenericLogger;
  threads?: number;
  onStatusChange?: (status: RelayerSDKStatus, error?: Error) => void;
  fheArtifactStorage?: GenericStorage;
  fheArtifactCacheTTL?: number;
}
```

With:

```ts
interface RelayerWebConfig {
  chain: ExtendedFhevmInstanceConfig;
  security?: RelayerWebSecurityConfig;
  logger?: GenericLogger;
  threads?: number;
  onStatusChange?: (status: RelayerSDKStatus, error?: Error) => void;
  fheArtifactStorage?: GenericStorage;
  fheArtifactCacheTTL?: number;
}
```

**File**: `packages/sdk/src/relayer/relayer-sdk.types.ts`

### 2. RelayerNodeConfig

Replace:

```ts
interface RelayerNodeConfig {
  transports: Record<number, Partial<FhevmInstanceConfig>>;
  getChainId: () => Promise<number>;
  poolSize?: number;
  logger?: GenericLogger;
  fheArtifactStorage?: GenericStorage;
  fheArtifactCacheTTL?: number;
}
```

With:

```ts
interface RelayerNodeConfig {
  chain: ExtendedFhevmInstanceConfig;
  poolSize?: number;
  logger?: GenericLogger;
  fheArtifactStorage?: GenericStorage;
  fheArtifactCacheTTL?: number;
}
```

**File**: `packages/sdk/src/relayer/relayer-node.ts`

### 3. RelayerWeb internals

- `#getWorkerConfig()` becomes synchronous: uses `this.#config.chain` directly instead of `await getChainId()` + `DefaultConfigs[chainId]` merge.
- Remove `#resolvedChainId` field and chain-change detection in `#ensureWorkerInner()`.
- The `Object.assign({}, DefaultConfigs[chainId], transports[chainId])` merge is no longer needed — the chain config arrives pre-merged from `toChainEntry` in `resolve.ts`.
- `#ensureWorkerInner()` simplifies: no chain-change teardown branch, just lazy init + auto-restart after terminate (React StrictMode support stays).
- Artifact cache creation uses `this.#config.chain.chainId` and `this.#config.chain.relayerUrl` directly.

**File**: `packages/sdk/src/relayer/relayer-web.ts`

### 4. RelayerNode internals

Same simplification as RelayerWeb:

- `#getPoolConfig()` becomes synchronous, uses `this.#config.chain`.
- Remove `#resolvedChainId` and chain-change teardown in `#ensurePoolInner()`.
- Artifact cache uses `this.#config.chain` fields directly.

**File**: `packages/sdk/src/relayer/relayer-node.ts`

### 5. resolve.ts — buildRelayer simplification

- Remove `groupByRelayer`, `ChainEntry`, and the relayer-grouping concept entirely. Each web/node chain gets its own relayer instance.
- Remove `buildHttpGroup`. Replace with direct construction:
  ```ts
  if (transport.type === "web") {
    const merged = { ...chain, ...transport.chain };
    perChainRelayers.set(
      chain.chainId,
      new RelayerWeb({
        chain: merged,
        ...transport.relayer,
      }),
    );
  }
  ```
- Remove `toChainEntry` — the merge happens inline.
- Keep the empty-relayerUrl validation (move it inline before construction).
- `HttpRelayerCtor` type is removed.

**File**: `packages/sdk/src/config/resolve.ts`

### 6. Transport types cleanup

`WebRelayerOptions` and `NodeRelayerOptions` stay — they still define the per-transport pool options (`threads`, `poolSize`, etc.) that get spread into the relayer config.

`WebTransportConfig.relayer` and `NodeTransportConfig.relayer` stay — they carry the pool options from `web(chain, relayer)` to `buildRelayer`.

**Files**: No changes to `transports.ts`.

## What stays the same

- `RelayerCleartext` — already single-chain, no changes.
- `CompositeRelayer` — unchanged, dispatches by chain ID.
- `createZamaConfig` public API — unchanged.
- `resolveChainTransports` — unchanged.
- `custom()` transport — unchanged.

## Testing

- Update `RelayerWeb` mock in `resolve.test.ts` to match new single-chain constructor shape.
- Update `RelayerNode` mock similarly.
- Existing `resolve.test.ts` tests for `buildRelayer` should still pass (they test the output, not the internal grouping).
- The "distinct relayer option references" test becomes "creates separate relayers per chain" (which is now always true).
- `relayer-web.ts` and `relayer-node.ts` tests (if any exist for chain switching) need updating to remove chain-switch scenarios.

## Out of scope

- Changing `DefaultConfigs` or chain preset shapes.
- Modifying `RelayerCleartext`.
- Changing `CompositeRelayer`.
- Public API changes to `createZamaConfig`.
