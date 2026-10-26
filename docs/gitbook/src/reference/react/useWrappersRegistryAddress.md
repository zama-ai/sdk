---
title: useWrappersRegistryAddress
description: Resolve the wrappers registry contract address for the provider's chain.
---

# useWrappersRegistryAddress

Resolves the wrappers registry address for the provider's chain. Uses built-in defaults (Mainnet, Sepolia) merged with chain-level registry addresses from the config.

Returns `undefined` when the chain ID hasn't been fetched yet or when no registry is configured for that chain.

## Import

```ts
import { useWrappersRegistryAddress } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="RegistryInfo.tsx" %}

```tsx
import { useWrappersRegistryAddress } from "@zama-fhe/react-sdk";

function RegistryInfo() {
  const registryAddress = useWrappersRegistryAddress();

  if (!registryAddress) return <p>No registry on this chain</p>;

  return <p>Registry: {registryAddress}</p>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

This hook takes no parameters. It reads registry addresses from the `ZamaSDK` instance provided by `ZamaProvider`.

## Return Type

`Address | undefined`

The registry contract address for the provider's chain, or `undefined` if unavailable.

## Chain resolution

The registry is resolved for the provider's chain, the same chain every registry read uses. The chain ID is cached for 30 seconds (`staleTime: 30000`), but the cache is keyed by the connected wallet's chain, so connecting a wallet or switching its chain refetches it instead of waiting out the cache. While that refetch is in flight the hook returns `undefined`, so dependent hooks show pending briefly rather than the previous chain's registry. With no wallet connected, the cached chain ID is reused until it goes stale. If your provider is pinned to one chain (for example, a single-chain `publicClient`), the registry stays on that chain even when the wallet switches.

## Related

- [WrappersRegistry](../sdk/WrappersRegistry.md) -- SDK-level registry class
- [Network Presets](../sdk/network-presets.md) -- built-in chain configurations and `DefaultRegistryAddresses`
- [useListPairs](./useListPairs.md) -- paginated pair listing (depends on this hook internally)
