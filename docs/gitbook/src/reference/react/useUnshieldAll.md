---
title: useUnshieldAll
description: Mutation hook that unshields the entire confidential balance.
---

# useUnshieldAll

Mutation hook that unshields the entire confidential balance. Orchestrates the full two-step flow (unwrap + finalize) in one call.

## Import

```ts
import { useUnshieldAll } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useUnshieldAll } from "@zama-fhe/react-sdk";

function UnshieldAllButton() {
  const { mutateAsync: unshieldAll, isPending } = useUnshieldAll({ tokenAddress: "0xToken" });

  async function handleUnshieldAll() {
    await unshieldAll({
      onUnwrapSubmitted: (txHash) => console.log("Unwrap tx:", txHash),
      onFinalizing: () => console.log("Waiting for proof..."),
      onFinalizeSubmitted: (txHash) => console.log("Done:", txHash),
    });
  }

  return (
    <button onClick={handleUnshieldAll} disabled={isPending}>
      {isPending ? "Unshielding..." : "Unshield All"}
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
import { type UseUnshieldAllParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential ERC-20 wrapper contract.

```ts
const { mutateAsync: unshieldAll } = useUnshieldAll({
  tokenAddress: "0xToken",
});
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time. All variables are optional.

### Progress callbacks

Callbacks are safe — if one throws, the unshield still completes.

| Callback                           | Fires when                                   |
| ---------------------------------- | -------------------------------------------- |
| `onUnwrapSubmitted(txHash: Hex)`   | Unwrap transaction is submitted on-chain.    |
| `onFinalizing()`                   | SDK begins waiting for the decryption proof. |
| `onFinalizeSubmitted(txHash: Hex)` | Finalize transaction is submitted on-chain.  |

```ts
await unshieldAll({
  onUnwrapSubmitted: (txHash) => updateUI("Step 1 submitted"),
  onFinalizing: () => updateUI("Awaiting proof..."),
  onFinalizeSubmitted: (txHash) => updateUI("Complete"),
});
```

## Return type

```ts
import { type UseUnshieldAllReturnType } from "@zama-fhe/react-sdk";
```

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useUnshield](/reference/react/useUnshield) — unshield a specific amount
- [useResumeUnshield](/reference/react/useResumeUnshield) — resume an interrupted unshield
- [useShield](/reference/react/useShield) — reverse operation, shield public tokens
- [Token.unshieldAll](/reference/sdk/Token#unshieldall) — imperative equivalent on the `Token` class
