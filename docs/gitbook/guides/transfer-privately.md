---
title: Transfer Privately
description: How to send confidential tokens so the amount stays hidden on-chain.
---

# Transfer Privately

Confidential transfers encrypt the amount before it reaches the chain -- no one can see how much was sent. The SDK handles FHE encryption internally via `token.confidentialTransfer()`. In React, use the `useConfidentialTransfer` and `useConfidentialTransferFrom` hooks.

## Steps

### 1. Create a token instance

Start from a configured SDK instance (see [Configuration](/guides/configuration)) and create a token pointing at your encrypted ERC-20 contract:

::: code-group

```ts [Core SDK]
const token = sdk.createToken("0xEncryptedERC20Address"); // [!code focus]
```

```tsx [React]
import { useToken } from "@zama-fhe/react-sdk";

const token = useToken({ tokenAddress: "0xEncryptedERC20Address" }); // [!code focus]
```

:::

### 2. Send a confidential transfer

Pass the recipient address and the plaintext amount. The SDK encrypts the amount using FHE before submitting the transaction:

::: code-group

```ts [Core SDK]
const { txHash } = await token.confidentialTransfer(
  // [!code focus]
  "0xRecipientAddress", // [!code focus]
  500n, // [!code focus]
); // [!code focus]
console.log("Transfer tx:", txHash);
```

```tsx [React]
import { useConfidentialTransfer } from "@zama-fhe/react-sdk";

const { mutateAsync: transfer, isPending } = useConfidentialTransfer({
  tokenAddress: "0xEncryptedERC20Address",
});

const txHash = await transfer({
  // [!code focus]
  to: "0xRecipientAddress", // [!code focus]
  amount: 500n, // [!code focus]
}); // [!code focus]
```

:::

The user sees a single wallet prompt. The encrypted amount is included in the transaction calldata -- it is unreadable to anyone without the FHE decryption key.

### 3. Send as an operator (transferFrom)

If an owner has approved you as an operator (via `token.approve()`), you can transfer on their behalf using `confidentialTransferFrom`:

::: code-group

```ts [Core SDK]
const { txHash } = await token.confidentialTransferFrom(
  // [!code focus]
  "0xOwnerAddress", // [!code focus]
  "0xRecipientAddress", // [!code focus]
  500n, // [!code focus]
); // [!code focus]
```

```tsx [React]
import { useConfidentialTransferFrom } from "@zama-fhe/react-sdk";

const { mutateAsync: transferFrom } = useConfidentialTransferFrom({
  tokenAddress: "0xEncryptedERC20Address",
});

await transferFrom({
  // [!code focus]
  from: "0xOwnerAddress", // [!code focus]
  to: "0xRecipientAddress", // [!code focus]
  amount: 500n, // [!code focus]
}); // [!code focus]
```

:::

The operator must have been approved beforehand. Check approval status with `token.isApproved("0xOperator")` or the `useConfidentialIsApproved` hook.

### 4. Handle the transaction result

Both the core SDK and React hooks return the transaction hash. Use it to confirm the transaction or update your UI:

::: code-group

```ts [Core SDK]
const { txHash } = await token.confidentialTransfer("0xRecipient", 500n);

// Wait for on-chain confirmation
const receipt = await signer.waitForTransactionReceipt(txHash);
console.log("Confirmed in block:", receipt.blockNumber);

// Optionally check updated balance
const balance = await token.balanceOf();
console.log("New balance:", balance);
```

```tsx [React]
const {
  mutateAsync: transfer,
  isPending, // true while the transaction is in flight
  isSuccess, // true after the mutation completes
  error, // populated if the transfer fails
} = useConfidentialTransfer({
  tokenAddress: "0xEncryptedERC20Address",
});

// Balance caches are invalidated automatically on success.
// The useConfidentialBalance hook picks up the updated balance
// on its next poll cycle — no manual refresh needed.
```

:::

### 5. (React) Use the transfer hook in a component

Here is a complete component that wires up the transfer with loading and error states:

```tsx
import {
  useConfidentialBalance,
  useConfidentialTransfer,
  matchZamaError,
} from "@zama-fhe/react-sdk";

const TOKEN = "0xEncryptedERC20Address";

function TransferForm() {
  const { data: balance } = useConfidentialBalance({ tokenAddress: TOKEN });
  const {
    mutateAsync: transfer,
    isPending,
    error,
  } = useConfidentialTransfer({
    tokenAddress: TOKEN,
  });

  const handleTransfer = async () => {
    await transfer({ to: "0xRecipient", amount: 100n }); // [!code focus]
  };

  const errorMessage = error
    ? matchZamaError(error, {
        SIGNING_REJECTED: () => "Transaction cancelled.",
        ENCRYPTION_FAILED: () => "Encryption failed — please retry.",
        TRANSACTION_REVERTED: () => "Transfer reverted — check your balance.",
        _: () => "Something went wrong.",
      })
    : null;

  return (
    <div>
      <p>Balance: {balance?.toString() ?? "Loading..."}</p>
      <button disabled={isPending} onClick={handleTransfer}>
        {isPending ? "Sending..." : "Send 100 tokens"}
      </button>
      {errorMessage && <p className="error">{errorMessage}</p>}
    </div>
  );
}
```

The `matchZamaError` helper maps SDK error codes to user-friendly messages. See the [Error Handling guide](/guides/handle-errors) for the full list of error types.

## Next steps

- [Shield Tokens](/guides/shield-tokens) — convert public ERC-20 tokens into confidential form
- [Token.confidentialTransfer reference](/reference/sdk/Token#confidentialtransfer) — full API signature
- [useConfidentialTransfer reference](/reference/react/useConfidentialTransfer) — React hook details
- [useConfidentialTransferFrom reference](/reference/react/useConfidentialTransferFrom) — operator transfer hook
