---
title: useWrappersRegistryAddress
description: Resolve the wrappers registry contract address for the current chain.
---

# useWrappersRegistryAddress

Resolves the wrappers registry address for the connected chain. Uses built-in defaults (Mainnet, Sepolia) merged with chain-level registry addresses from the config.

Returns `undefined` when the chain ID hasn't been fetched yet or when no registry is configured for the connected chain.

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

The registry contract address for the connected chain, or `undefined` if unavailable.

## Chain resolution

The registry is resolved for the chain the provider reads from. That chain ID is cached for 30 seconds (`staleTime: 30000`) but refetched as soon as the connected wallet switches chain, so a switch re-resolves the registry immediately. A provider pinned to one chain (a viem `publicClient` or an ethers provider) keeps its registry even while the wallet is on another chain; the SDK's write paths reject that state with `ChainMismatchError`.

## Related

- [WrappersRegistry](../sdk/WrappersRegistry.md) -- SDK-level registry class
- [Network Presets](../sdk/network-presets.md) -- built-in chain configurations and `DefaultRegistryAddresses`
- [useListPairs](./useListPairs.md) -- paginated pair listing (depends on this hook internally)
