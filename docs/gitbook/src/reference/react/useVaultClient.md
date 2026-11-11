---
title: useVaultClient
description: Returns a VaultClient bound to the SDK in context.
---

# useVaultClient

Returns a [`VaultClient`](../sdk/VaultClient.md) bound to the SDK from [`ZamaProvider`](ZamaProvider.md), the same one for as long as that SDK stays. It holds no config: its methods take the group or the batch they act on, so one client serves every group and chain.

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
import type { Address } from "viem";
import { STABLE } from "./vaults";

function PrepareButton({ account }: { account: Address }) {
  const vaults = useVaultClient();

  async function handleClick() {
    const prepared = await vaults.prepareDeposit(STABLE, {
      vaultId: "beta",
      account,
      amount: 1_000_000n,
    });
    await sendCalls(prepared.calls);
  }

  return <button onClick={handleClick}>Deposit</button>;
}
```

{% endtab %}
{% tab title="vaults.ts" %}

```ts
import { defineVaultGroup } from "@zama-fhe/sdk/vaults";

export const STABLE = defineVaultGroup({
  id: "stable",
  chainId: 1,
  asset: "0xConfidentialUSDC",
  vaults: [
    {
      id: "alpha",
      batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" },
      share: "0xAlphaShare",
    },
    {
      id: "beta",
      batchers: { deposit: "0xBetaDeposit", redeem: "0xBetaRedeem" },
      share: "0xBetaShare",
    },
  ],
});
```

{% endtab %}
{% endtabs %}

`sendCalls` stands in for your own pipeline. See [Send through your own pipeline](../../guides/vaults/advanced.md#send-through-your-own-pipeline).

## Parameters

None.

## Return Type

`VaultClient`. See [`VaultClient`](../sdk/VaultClient.md).

## Related

- [VaultClient](../sdk/VaultClient.md): every method of the client
- [useDeposit](./useDeposit.md), [useBatch](./useBatch.md): hooks built on it
- [Vaults overview](../../guides/vaults/README.md)
