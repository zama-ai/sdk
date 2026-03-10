---
title: useConfidentialBalance
description: Decrypt and poll a single token's confidential balance.
---

# useConfidentialBalance

Decrypt and poll a single token's confidential balance. Uses [two-phase polling](/concepts/two-phase-polling) -- cheaply checks the encrypted handle on-chain, only decrypts when it changes. Decrypted values are persisted in storage, so page reloads display the balance instantly.

## Import

```ts
import { useConfidentialBalance } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useConfidentialBalance } from "@zama-fhe/react-sdk";

function TokenBalance({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const {
    data: balance,
    isLoading,
    error,
  } = useConfidentialBalance({
    tokenAddress,
  });

  if (isLoading) return <span>Decrypting...</span>;
  if (error) return <span>Error: {error.message}</span>;
  return <span>{balance?.toString()}</span>;
}
```

{% endtab %}
{% tab title="config.ts" %}

```ts
import { ZamaSDK, RelayerWeb, indexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [11155111]: {
        relayerUrl: "https://your-app.com/api/relayer/1",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: indexedDBStorage,
});
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseConfidentialBalanceParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Contract address of the confidential ERC-20 token.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { data } = useConfidentialBalance({
  tokenAddress: "0xToken",
});
```

{% endtab %}
{% endtabs %}

---

### owner

`Address | undefined`

Address whose balance to read. Defaults to the connected wallet address from the signer.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { data } = useConfidentialBalance({
  tokenAddress: "0xToken",
  owner: "0xOwner",
});
```

{% endtab %}
{% endtabs %}

### handleRefetchInterval

`number | undefined`

Polling interval in milliseconds for checking on-chain handle changes. Default: `10000` (10 seconds).

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { data } = useConfidentialBalance({
  tokenAddress: "0xToken",
  handleRefetchInterval: 5_000,
});
```

{% endtab %}
{% endtabs %}

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type UseConfidentialBalanceReturnType } from "@zama-fhe/react-sdk";
```

The `data` property is `bigint | undefined` -- the decrypted token balance.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useConfidentialBalances](/reference/react/useConfidentialBalances) -- batch variant for multiple tokens
- [Two-Phase Polling](/concepts/two-phase-polling)
- [Check Balances guide](/guides/check-balances)
- [Query Keys](/reference/react/query-keys) -- `zamaQueryKeys.confidentialBalance`
