---
title: useShield
description: Mutation hook that shields public ERC-20 tokens into confidential form.
---

# useShield

Mutation hook that shields public ERC-20 tokens into confidential form, handling the ERC-20 approval automatically.

## Import

```ts
import { useShield } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useShield } from "@zama-fhe/react-sdk";

function ShieldButton() {
  const { mutateAsync: shield, isPending, error } = useShield({ tokenAddress: "0xToken" });

  async function handleShield() {
    const { txHash, receipt } = await shield({ amount: 1000n });
    console.log("Shielded in", txHash);
  }

  return (
    <button onClick={handleShield} disabled={isPending}>
      {isPending ? "Shielding..." : "Shield"}
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
import { type UseShieldConfig } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential ERC-20 wrapper contract.

```ts
const { mutateAsync: shield } = useShield({
  tokenAddress: "0xToken",
});
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

### amount

`bigint`

Number of tokens to shield (in the token's smallest unit).

```ts
await shield({ amount: 1000n });
```

### approvalStrategy

`"exact" | "max" | "skip"` (optional, default `"exact"`)

Controls how the SDK handles the ERC-20 approval before shielding.

| Strategy  | Behavior                                                                        |
| --------- | ------------------------------------------------------------------------------- |
| `"exact"` | Approves only the shielded amount. Safest, but costs an approval tx every time. |
| `"max"`   | Approves `type(uint256).max`. One approval covers all future shields.           |
| `"skip"`  | Skips the approval step entirely. Use when the wrapper is already approved.     |

```ts
await shield({ amount: 1000n, approvalStrategy: "max" });
```

### Progress callbacks

| Callback                           | Fires when                         |
| ---------------------------------- | ---------------------------------- |
| `onApprovalSubmitted(txHash: Hex)` | Approval transaction is submitted. |
| `onShieldSubmitted(txHash: Hex)`   | Shield transaction is submitted.   |

```ts
await shield({
  amount: 1000n,
  onApprovalSubmitted: (txHash) => updateUI(`Approval: ${txHash}`),
  onShieldSubmitted: (txHash) => updateUI(`Shield: ${txHash}`),
});
```

**Throws:**

- `InsufficientERC20BalanceError` -- if the ERC-20 balance is less than `amount` (exposes `requested`, `available`, `token`)

## Return type

```ts
import { type ShieldParams } from "@zama-fhe/react-sdk";
```

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useUnshield](/reference/react/useUnshield) — reverse operation, unshield back to public ERC-20
- [Token.shield](/reference/sdk/Token#shield) — imperative equivalent on the `Token` class
