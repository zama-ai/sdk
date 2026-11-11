---
title: useBatcherTokens
description: Query hook for a vault batcher's input and output token addresses.
---

# useBatcherTokens

Reads a batcher's input and output token addresses: [`VaultBatcher.fromToken`](../sdk/VaultBatcher.md#fromtoken) and [`VaultBatcher.toToken`](../sdk/VaultBatcher.md#totoken). For a deposit batcher, `fromToken` is the vault's confidential asset and `toToken` its confidential share, the addresses [`useConfidentialBalance`](./useConfidentialBalance.md) needs. The redeem batcher has them the other way around.

The addresses are fixed when the batcher is deployed, so the hook reads them once and never refetches.

## Import

```ts
import { useBatcherTokens } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="VaultTokens.tsx" %}

```tsx
import { useBatcherTokens } from "@zama-fhe/react-sdk/vaults";

function VaultTokens() {
  const { data: tokens } = useBatcherTokens({ address: "0xDepositBatcher" });

  if (!tokens) return <span>Loading…</span>;
  return (
    <span>
      Asset {tokens.fromToken}, share {tokens.toToken}
    </span>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseBatcherTokensConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

---

### chainId

`number | undefined`

Chain to read from, if it is not the connected one. Needs a provider that can read other chains, such as `WagmiProvider`.

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type UseBatcherTokensOptions } from "@zama-fhe/react-sdk/vaults";
import { type BatcherTokens } from "@zama-fhe/sdk/vaults";
```

The `data` property is `{ fromToken: Address; toToken: Address } | undefined`, `undefined` while loading.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useConfidentialBalance](./useConfidentialBalance.md) — reads either token's balance
- [VaultBatcher.fromToken](../sdk/VaultBatcher.md#fromtoken)
