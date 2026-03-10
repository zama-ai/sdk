---
title: useBatchTransferFee
description: Query hook that reads the batch transfer fee from a fee manager contract.
---

# useBatchTransferFee

Query hook that reads the batch transfer fee from a fee manager contract.

## Import

```ts
import { useBatchTransferFee } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useBatchTransferFee } from "@zama-fhe/react-sdk";

function BatchFeeDisplay() {
  const { data: fee, isLoading, error } = useBatchTransferFee("0xFeeManager");

  if (isLoading) return <span>Loading fee...</span>;
  if (error) return <span>Failed to load fee</span>;

  return <span>Batch transfer fee: {fee?.toString()}</span>;
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

### feeManagerAddress

`Address`

Address of the fee manager contract to query.

```ts
const { data: fee } = useBatchTransferFee("0xFeeManager");
```

## Return Type

Standard `UseQueryResult` where `data` is `bigint` — the batch transfer fee amount.

## Related

- [useFeeRecipient](/reference/react/useFeeRecipient) — read the fee recipient address from the same contract
- [Hooks: Fees](/reference/react/useShieldFee) — overview of all fee hooks
