# relayer() Transport Helper

## Goal

Add a `relayer()` helper function that simplifies per-chain transport configuration in `createZamaConfig`, modeled after wagmi's `http()` helper. For the wagmi path, infer the RPC network URL from wagmi's configured transports so users only need to specify their relayer proxy URL.

## Motivation

Current transport config is verbose — users spread `SepoliaConfig` then override 1-2 fields:

```ts
createZamaConfig({
  wagmiConfig,
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      relayerUrl: "/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/KEY",
    },
  },
});
```

The `network` field duplicates what's already in the wagmi config, and spreading `SepoliaConfig` is boilerplate since `DefaultConfigs` already provides the base.

## Design

### `relayer()` helper

Exported from `@zama-fhe/react-sdk` (and re-exported from `@zama-fhe/sdk`):

```ts
export function relayer(
  relayerUrl: string,
  overrides?: Partial<ExtendedFhevmInstanceConfig>,
): Partial<ExtendedFhevmInstanceConfig> {
  return { relayerUrl, ...overrides };
}
```

A one-liner that returns a partial config with `relayerUrl` set. Optional overrides (`auth`, `network`, etc.) spread on top.

### Network inference from wagmi

In the wagmi path of `resolveTransports`, extract the RPC URL from wagmi's internal transport config:

```ts
const wagmiTransport = params.wagmiConfig._internal.transports[chain.id];
const inferredNetwork = wagmiTransport?.({ chain })?.value?.url;
```

This works for `http()` transports where `value.url` contains the RPC URL. For `webSocket()` or `custom()` transports, `value?.url` is undefined — network is not inferred, and the user can override it via `relayer(url, { network: "..." })`.

### Merge priority

```
DefaultConfigs[chainId]  <  inferred wagmi network  <  relayer() overrides
```

User overrides always win. Wagmi inference only fills in `network` if the user didn't specify it.

### Updated `resolveTransports` (wagmi path)

```ts
for (const chain of params.wagmiConfig.chains) {
  const defaultConfig = DefaultConfigs[chain.id];
  const userOverride = params.transports?.[chain.id];

  if (!defaultConfig && !userOverride) {
    throw new ConfigurationError(
      `Chain ${chain.id} (${chain.name}) has no default FHE config and no transport override.`,
    );
  }

  const wagmiTransport = params.wagmiConfig._internal.transports[chain.id];
  const inferredNetwork = wagmiTransport?.({ chain })?.value?.url;

  resolved[chain.id] = {
    ...defaultConfig,
    ...(inferredNetwork ? { network: inferredNetwork } : {}),
    ...userOverride,
  };
}
```

### Non-wagmi paths

Unchanged. `transports` remains `Record<number, Partial<ExtendedFhevmInstanceConfig>>`. The `relayer()` helper works there too as a convenience, but users can still pass raw objects.

## Usage examples

```ts
// Wagmi — minimal, network inferred from wagmi config
createZamaConfig({
  wagmiConfig,
  transports: {
    [sepolia.id]: relayer("/api/relayer/11155111"),
  },
});

// Wagmi — with auth
createZamaConfig({
  wagmiConfig,
  transports: {
    [sepolia.id]: relayer("/api/relayer/11155111", {
      auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_KEY },
    }),
  },
});

// Wagmi — no transports (uses DefaultConfigs relayerUrl + wagmi network)
createZamaConfig({ wagmiConfig });

// Viem — relayer() works here too, but network must be explicit
createZamaConfig({
  viem: { publicClient, walletClient },
  transports: {
    [sepolia.id]: relayer("/api/relayer/11155111", {
      network: "https://sepolia.infura.io/v3/KEY",
    }),
  },
});
```

## Scope

- Add `relayer()` function to `@zama-fhe/react-sdk` (also export from `@zama-fhe/sdk`)
- Update `resolveTransports` wagmi path to infer `network` from wagmi internals
- Update tests for new merge behavior and `relayer()` helper
- Update examples and docs to use `relayer()` instead of manual spreading
