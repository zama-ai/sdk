---
title: useConfidentialTransfer
description: Send confidential ERC-20 tokens privately.
---

# useConfidentialTransfer

Send confidential ERC-20 tokens privately. The amount is encrypted client-side before the transaction is submitted on-chain. Automatically invalidates the [`useConfidentialBalance`](/reference/react/useConfidentialBalance) cache on success.

## Import

```ts
import { useConfidentialTransfer } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useConfidentialTransfer } from "@zama-fhe/react-sdk";

function SendButton({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { mutateAsync: transfer, isPending } = useConfidentialTransfer({
    address: tokenAddress,
  });

  async function handleSend() {
    const { txHash, receipt } = await transfer({
      to: "0xRecipient",
      amount: 1000n,
    });
    console.log("Confirmed in block", receipt.blockNumber);
  }

  return (
    <button onClick={handleSend} disabled={isPending}>
      {isPending ? "Sending..." : "Send"}
    </button>
  );
}
```

{% endtab %}
{% tab title="config.ts" %}

```ts
// config.ts
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk/web";
import { sepolia } from "@zama-fhe/sdk/chains";
import type { FheChain } from "@zama-fhe/sdk/chains";
import { config as wagmiConfig } from "./wagmi";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

export const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: { [mySepolia.id]: web() },
});

// In your app layout:
// <ZamaProvider config={zamaConfig}>
//   <App />
// </ZamaProvider>
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseConfidentialTransferConfig } from "@zama-fhe/react-sdk";
```

### address

`Address`

Contract address of the confidential token.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { mutateAsync: transfer } = useConfidentialTransfer({
  address: "0xToken",
});
```

{% endtab %}
{% endtabs %}

### optimistic

`boolean | undefined`

Default: `false`. When `true`, optimistically subtracts the transfer amount from the cached confidential balance before the transaction confirms; rolls back on error.

```tsx
const { mutateAsync: transfer } = useConfidentialTransfer({
  address: "0xToken",
  optimistic: true,
});
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

The function passed to `mutate` / `mutateAsync` accepts:

### to

`Address`

Recipient address.

### amount

`bigint`

Number of tokens to transfer (in the token's smallest unit). Encrypted before submission.

### skipBalanceCheck

`boolean | undefined`

Skip confidential balance validation before submitting. Defaults to `false`. Useful for smart wallets that cannot produce EIP-712 signatures for balance decryption.

### onEncryptComplete

`(() => void) | undefined`

Fires when FHE encryption of the amount completes.

### onTransferSubmitted

`((txHash: Hex) => void) | undefined`

Fires when the transfer transaction is submitted on-chain.

```tsx
await transfer({
  to: "0xRecipient",
  amount: 1000n,
  onEncryptComplete: () => updateUI("Encrypted, submitting..."),
  onTransferSubmitted: (txHash) => updateUI(`Submitted: ${txHash}`),
});
```

**Throws:**

- `InsufficientConfidentialBalanceError` -- if the confidential balance is less than `amount` (exposes `requested`, `available`, `token`)
- `BalanceCheckUnavailableError` -- if balance validation is required but decryption is not possible (no stored permits). Grant a permit first with `useGrantPermit`, or use `skipBalanceCheck: true`

## Return Type

The `data` property (after a successful mutation) is `{ txHash: Hex, receipt: TransactionReceipt }`.

- **`txHash`** -- Transaction hash submitted to the network.
- **`receipt`** -- Confirmed transaction receipt from the chain.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useConfidentialTransferFrom](/reference/react/useConfidentialTransferFrom) -- operator transfer variant
- [Transfer Privately guide](/guides/transfer-privately)
- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- auto-invalidated on success
