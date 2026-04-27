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
    tokenAddress,
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
import { createConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";
import type { FheChain } from "@zama-fhe/sdk/chains";
import { config as wagmiConfig } from "./wagmi";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-relayer.example.com/v2",
  network: "https://your-rpc.example.com",
} as const satisfies FheChain;

export const zamaConfig = createConfig({
  chains: [mySepolia],
  relayers: { [mySepolia.id]: web() },
  wagmiConfig,
});
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseConfidentialTransferConfig } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Contract address of the confidential ERC-20 token.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { mutateAsync: transfer } = useConfidentialTransfer({
  tokenAddress: "0xToken",
});
```

{% endtab %}
{% endtabs %}

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
- `BalanceCheckUnavailableError` -- if balance validation is required but decryption is not possible (no cached credentials). Call `allow()` first or use `skipBalanceCheck: true`

## Return Type

The `data` property (after a successful mutation) is `{ txHash: Hex, receipt: TransactionReceipt }`.

- **`txHash`** -- Transaction hash submitted to the network.
- **`receipt`** -- Confirmed transaction receipt from the chain.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useConfidentialTransferFrom](/reference/react/useConfidentialTransferFrom) -- operator transfer variant
- [Transfer Privately guide](/guides/transfer-privately)
- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- auto-invalidated on success
