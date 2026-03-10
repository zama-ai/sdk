---
title: useFeeRecipient
description: Query hook that reads the fee recipient address from a fee manager contract.
---

# useFeeRecipient

Query hook that reads the fee recipient address from a fee manager contract.

## Import

```ts
import { useFeeRecipient } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useFeeRecipient } from "@zama-fhe/react-sdk";

function FeeRecipientDisplay() {
  const { data: recipient, isLoading, error } = useFeeRecipient("0xFeeManager");

  if (isLoading) return <span>Loading...</span>;
  if (error) return <span>Failed to load recipient</span>;

  return <span>Fee recipient: {recipient}</span>;
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

### feeManagerAddress

`Address`

Address of the fee manager contract to query.

```ts
const { data: recipient } = useFeeRecipient("0xFeeManager");
```

## Return Type

Standard `UseQueryResult` where `data` is `Address` — the address that receives collected fees.

## Related

- [useBatchTransferFee](/reference/react/useBatchTransferFee) — read the batch transfer fee from the same contract
- [Hooks: Fees](/reference/react/useShieldFee) — overview of all fee hooks
