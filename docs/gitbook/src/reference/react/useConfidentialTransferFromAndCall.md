---
title: useConfidentialTransferFromAndCall
description: Operator-initiated confidential transfer that also invokes the recipient's receiver hook in one transaction.
---

# useConfidentialTransferFromAndCall

Operator-initiated `confidentialTransferFromAndCall` — an ERC-7984 confidential transfer on behalf of another address that also invokes the recipient's receiver hook in a single transaction. The caller must be an approved operator for `from` (grant approval via [`useConfidentialSetOperator`](./useConfidentialSetOperator.md)). The caller crafts the opaque `data` payload; the SDK does not encode, validate, or interpret it. Invalidates the [`useConfidentialBalance`](./useConfidentialBalance.md) cache on success.

## Import

```ts
import { useConfidentialTransferFromAndCall } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useConfidentialTransferFromAndCall } from "@zama-fhe/react-sdk";

function OperatorTransferAndCall({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { mutateAsync: transferFromAndCall, isPending } =
    useConfidentialTransferFromAndCall(tokenAddress);

  async function handleTransfer() {
    const { txHash, receipt } = await transferFromAndCall({
      from: "0xOwner",
      to: "0xReceiverContract",
      amount: 500n,
      data: "0xabcd",
    });
    console.log("Confirmed in block", receipt.blockNumber);
  }

  return (
    <button onClick={handleTransfer} disabled={isPending}>
      {isPending ? "Transferring..." : "Transfer"}
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

### address

`Address`

Contract address of the confidential token. Passed positionally as the first argument.

```ts
const { mutateAsync: transferFromAndCall } = useConfidentialTransferFromAndCall("0xToken");
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type ConfidentialTransferFromAndCallParams } from "@zama-fhe/sdk/query";
```

The function passed to `mutate` / `mutateAsync` accepts:

### from

`Address`

Owner address whose tokens are being transferred. The connected wallet must have operator approval from this address.

### to

`Address`

Recipient address.

### amount

`bigint`

Number of tokens to transfer (in the token's base units). Encrypted before submission.

### data

`Hex`

Opaque bytes forwarded to the recipient's ERC-7984 receiver hook. The caller is responsible for encoding this payload.

### callbacks

`TransferCallbacks | undefined`

Optional progress callbacks for the multi-step transfer flow: `onEncryptComplete` (fires after FHE encryption of the amount completes) and `onTransferSubmitted` (fires after the transfer transaction is submitted).

```ts
await transferFromAndCall({
  from: "0xOwner",
  to: "0xReceiverContract",
  amount: 500n,
  data: "0xabcd",
});
```

**Throws:**

- `SigningRejectedError` -- if the user rejects the wallet prompt
- `EncryptionFailedError` -- if FHE encryption of the transfer amount fails
- `TransactionRevertedError` -- if the on-chain transaction reverts

## Return Type

The `data` property (after a successful mutation) is `{ txHash: Hex, receipt: TransactionReceipt }`.

- **`txHash`** -- Transaction hash submitted to the network.
- **`receipt`** -- Confirmed transaction receipt from the chain.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useConfidentialTransferFrom](./useConfidentialTransferFrom.md) -- operator transfer without a receiver hook
- [useConfidentialTransfer](./useConfidentialTransfer.md) -- direct transfer (no operator)
- [useConfidentialSetOperator](./useConfidentialSetOperator.md) -- grant operator approval
- [useConfidentialBalance](./useConfidentialBalance.md) -- auto-invalidated on success
