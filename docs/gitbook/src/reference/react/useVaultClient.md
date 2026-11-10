---
title: useVaultClient
description: Returns the VaultClient for a defineVaults config, memoized per SDK and config.
---

# useVaultClient

Returns the [`VaultClient`](../sdk/VaultClient.md) for a `defineVaults` config, created with the SDK from [`ZamaProvider`](ZamaProvider.md). The client is memoized per SDK and config, so define the config once at module level to keep its identity across renders.

The other vault hooks call it for you. Use it directly when you need a method no hook wraps, such as a `prepare*` method for your own transaction pipeline.

## Import

```ts
import { useVaultClient } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="PrepareButton.tsx" %}

```tsx
import { useVaultClient } from "@zama-fhe/react-sdk/vaults";
import { VAULTS } from "./vaults";

function PrepareButton() {
  const client = useVaultClient(VAULTS);

  async function handleClick() {
    const prepared = await client.prepareDeposit({
      groupId: "stable",
      vaultId: "beta",
      amount: 1_000_000n,
    });
    await sendPrepared(prepared);
  }

  return <button onClick={handleClick}>Deposit</button>;
}
```

{% endtab %}
{% tab title="vaults.ts" %}

```ts
import { defineVaults } from "@zama-fhe/sdk/vaults";

export const VAULTS = defineVaults({
  chainId: 1,
  groups: {
    stable: {
      asset: "0xConfidentialUSDC",
      vaults: {
        alpha: { depositBatcher: "0xAlphaDeposit", redeemBatcher: "0xAlphaRedeem" },
        beta: { depositBatcher: "0xBetaDeposit", redeemBatcher: "0xBetaRedeem" },
      },
    },
  },
});
```

{% endtab %}
{% endtabs %}

`sendPrepared` stands in for your own pipeline. See [Send through your own pipeline](../../guides/vaults/groups.md#send-through-your-own-pipeline).

## Parameters

### config

`VaultsConfig`

The config returned by [`defineVaults`](../sdk/VaultClient.md#definevaults). Pass the same object on every render: a new object creates a new client.

## Return Type

`VaultClient<typeof config>`. See [`VaultClient`](../sdk/VaultClient.md).

## Related

- [VaultClient](../sdk/VaultClient.md): every method of the client
- [usePosition](./usePosition.md), [useDeposit](./useDeposit.md): the hooks built on it
- [Vaults overview](../../guides/vaults/README.md)
