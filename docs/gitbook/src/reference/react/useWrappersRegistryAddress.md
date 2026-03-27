---
title: useWrappersRegistryAddress
description: Resolve the wrappers registry contract address for the current chain.
---

# useWrappersRegistryAddress

Resolves the wrappers registry address for the connected chain. Uses built-in defaults (Mainnet, Sepolia) merged with any `registryAddresses` overrides passed to `ZamaProvider`.

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

## Caching

The underlying chain ID query uses `staleTime: 30000` (30 seconds). Chain switches may take up to 30 seconds to reflect.

## Related

- [WrappersRegistry](/reference/sdk/WrappersRegistry) -- SDK-level registry class
- [Network Presets](/reference/sdk/network-presets) -- built-in chain configurations and `DefaultRegistryAddresses`
- [useListPairs](/reference/react/useListPairs) -- paginated pair listing (depends on this hook internally)
