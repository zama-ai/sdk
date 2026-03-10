---
title: useUnshield
description: Mutation hook that unshields confidential tokens back to public ERC-20.
---

# useUnshield

Mutation hook that unshields confidential tokens back to public ERC-20. Orchestrates the full two-step flow (unwrap + finalize) in one call.

## Import

```ts
import { useUnshield } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useUnshield } from "@zama-fhe/react-sdk";

function UnshieldButton() {
  const { mutateAsync: unshield, isPending } = useUnshield({ tokenAddress: "0xToken" });

  async function handleUnshield() {
    await unshield({
      amount: 500n,
      callbacks: {
        onUnwrapSubmitted: (txHash) => console.log("Unwrap tx:", txHash),
        onFinalizing: () => console.log("Waiting for decryption proof..."),
        onFinalizeSubmitted: (txHash) => console.log("Finalized:", txHash),
      },
    });
  }

  return (
    <button onClick={handleUnshield} disabled={isPending}>
      {isPending ? "Unshielding..." : "Unshield"}
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
import { type UnshieldParams } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential ERC-20 wrapper contract.

```ts
const { mutateAsync: unshield } = useUnshield({
  tokenAddress: "0xToken",
});
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation Variables

Passed to `mutate` / `mutateAsync` at call time.

### amount

`bigint`

Number of confidential tokens to unshield.

```ts
await unshield({ amount: 500n });
```

### callbacks

`object` (optional)

Progress callbacks for each phase. Callbacks are safe — if one throws, the unshield still completes.

| Callback                           | Fires when                                   |
| ---------------------------------- | -------------------------------------------- |
| `onUnwrapSubmitted(txHash: Hex)`   | Unwrap transaction is submitted on-chain.    |
| `onFinalizing()`                   | SDK begins waiting for the decryption proof. |
| `onFinalizeSubmitted(txHash: Hex)` | Finalize transaction is submitted on-chain.  |

```ts
await unshield({
  amount: 500n,
  callbacks: {
    onUnwrapSubmitted: (txHash) => updateUI("Step 1 submitted"),
    onFinalizing: () => updateUI("Awaiting proof..."),
    onFinalizeSubmitted: (txHash) => updateUI("Complete"),
  },
});
```

## Return Type

```ts
import { type UnshieldParams } from "@zama-fhe/react-sdk";
```

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useUnshieldAll](/reference/react/useUnshieldAll) — unshield the entire confidential balance
- [useResumeUnshield](/reference/react/useResumeUnshield) — resume an interrupted unshield
- [useShield](/reference/react/useShield) — reverse operation, shield public tokens
- [Token.unshield](/reference/sdk/Token#unshield) — imperative equivalent on the `Token` class
