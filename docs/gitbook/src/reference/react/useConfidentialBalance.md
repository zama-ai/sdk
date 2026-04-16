---
title: useConfidentialBalance
description: Decrypt a single token's confidential balance.
---

# useConfidentialBalance

Decrypt a single token's confidential balance. Calls `token.balanceOf(owner)` which reads the encrypted handle on-chain and decrypts it via the SDK. Previously decrypted values are served from cache instantly — the expensive relayer round-trip only happens when the on-chain handle changes. Pass `refetchInterval` to poll for updates.

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
      [1]: {
        relayerUrl: "https://your-app.com/api/relayer/1",
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
      },
      [11155111]: {
        relayerUrl: "https://your-app.com/api/relayer/11155111",
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
import { type UseConfidentialBalanceConfig } from "@zama-fhe/react-sdk";
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

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type UseConfidentialBalanceOptions } from "@zama-fhe/react-sdk";
```

The `data` property is `bigint | undefined` -- the decrypted token balance.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useConfidentialBalances](/reference/react/useConfidentialBalances) -- batch variant for multiple tokens
- [Check Balances guide](/guides/check-balances)
- [Query Keys](/reference/react/query-keys) -- `zamaQueryKeys.confidentialBalance`
