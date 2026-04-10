---
title: useShieldETH
description: Mutation hook that shields native ETH into a confidential ETH wrapper contract.
---

# useShieldETH

Mutation hook that shields native ETH into a confidential ETH wrapper contract. No ERC-20 approval needed.

## Import

```ts
import { useShieldETH } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useShieldETH } from "@zama-fhe/react-sdk";

function ShieldETHButton() {
  const { mutateAsync: shieldETH, isPending, error } = useShieldETH({ tokenAddress: "0xToken" });

  async function handleShield() {
    const { txHash, receipt } = await shieldETH({ amount: 1000n });
    console.log("ETH shielded in", txHash);
  }

  return (
    <button onClick={handleShield} disabled={isPending}>
      {isPending ? "Shielding ETH..." : "Shield ETH"}
    </button>
  );
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
import { type UseShieldETHParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential ETH wrapper contract.

```ts
const { mutateAsync: shieldETH } = useShieldETH({
  tokenAddress: "0xToken",
});
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

### amount

`bigint`

Amount of ETH to shield (in wei).

```ts
await shieldETH({ amount: 1000n });
```

## Return type

```ts
import { type UseShieldETHReturnType } from "@zama-fhe/react-sdk";
```

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useShield](/reference/react/useShield) — shield ERC-20 tokens (with automatic approval)
- [useUnshield](/reference/react/useUnshield) — unshield confidential tokens back to public form
- [Token.shieldETH](/reference/sdk/Token#shieldeth) — imperative equivalent on the `Token` class
