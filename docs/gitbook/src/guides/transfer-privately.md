---
title: Transfer privately
description: How to send confidential tokens so the amount stays hidden on-chain.
---

# Transfer privately

Confidential transfers encrypt the amount before it reaches the chain -- no one can see how much was sent. The SDK handles FHE encryption internally via `token.confidentialTransfer()`. In React, use the `useConfidentialTransfer` and `useConfidentialTransferFrom` hooks.

## Steps

### 1. Create a token instance

Start from a configured SDK instance (see [Configuration](./configuration.md)) and create a token pointing at your encrypted ERC-20 contract:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const token = sdk.createToken("0xEncryptedERC20Address");
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useToken } from "@zama-fhe/react-sdk";

const token = useToken("0xEncryptedERC20Address");
```

{% endtab %}
{% endtabs %}

### 2. Send a confidential transfer

Pass the recipient address and the plaintext amount. The SDK encrypts the amount using FHE before submitting the transaction.

By default, the SDK validates the confidential balance before submitting. If stored permits exist, it decrypts silently. If the balance is insufficient, it throws `InsufficientConfidentialBalanceError` before any transaction is sent. Pass `skipBalanceCheck: true` to bypass (e.g. for smart wallets that cannot produce EIP-712 signatures).

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { txHash } = await token.confidentialTransfer("0xRecipientAddress", 500n);
console.log("Transfer tx:", txHash);
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useConfidentialTransfer } from "@zama-fhe/react-sdk";

const { mutateAsync: transfer, isPending } = useConfidentialTransfer({
  address: "0xEncryptedERC20Address",
});

const { txHash } = await transfer({ to: "0xRecipientAddress", amount: 500n });
```

{% endtab %}
{% endtabs %}

The user sees a single wallet prompt. The encrypted amount is included in the transaction calldata -- it is unreadable to anyone without the FHE decryption key.

### 3. Send as an operator (transferFrom)

If an owner has approved you as an operator (via `token.setOperator()`), you can transfer on their behalf using `confidentialTransferFrom`:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { txHash } = await token.confidentialTransferFrom(
  "0xOwnerAddress",
  "0xRecipientAddress",
  500n,
);
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useConfidentialTransferFrom } from "@zama-fhe/react-sdk";

const { mutateAsync: transferFrom } = useConfidentialTransferFrom("0xEncryptedERC20Address");

await transferFrom({ from: "0xOwnerAddress", to: "0xRecipientAddress", amount: 500n });
```

{% endtab %}
{% endtabs %}

The operator must have been approved beforehand. Check approval status with `token.isOperator("0xHolder", "0xOperator")` or the `useConfidentialIsOperator` hook.

### 4. Handle the transaction result

Both the core SDK and React hooks resolve to a `TransactionResult` with the transaction `txHash` and its mined `receipt`. Use them to confirm the transaction or update your UI:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { txHash } = await token.confidentialTransfer("0xRecipient", 500n);

// Wait for on-chain confirmation
const receipt = await sdk.provider.waitForTransactionReceipt(txHash);
console.log("Confirmed in block:", receipt.blockNumber);

// Optionally check updated balance
const [address] = await walletClient.getAddresses();
const balance = await token.balanceOf(address);
console.log("New balance:", balance);
```

{% endtab %}
{% tab title="React" %}

```tsx
const {
  mutateAsync: transfer,
  isPending, // true while the transaction is in flight
  isSuccess, // true after the mutation completes
  error, // populated if the transfer fails
} = useConfidentialTransfer({ address: "0xEncryptedERC20Address" });

// Balance caches are invalidated automatically on success.
// The useConfidentialBalance hook picks up the updated balance
// on its next poll cycle — no manual refresh needed.
```

{% endtab %}
{% endtabs %}

### 5. (React) Use the transfer hook in a component

Here is a complete component that wires up the transfer with loading and error states:

```tsx
import { useConfidentialBalance, useConfidentialTransfer } from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";
import { matchZamaError } from "@zama-fhe/sdk";

const TOKEN = "0xEncryptedERC20Address";

function TransferForm() {
  const { address } = useAccount();
  const { data: balance } = useConfidentialBalance({ address: TOKEN, account: address });
  const { mutateAsync: transfer, isPending, error } = useConfidentialTransfer({ address: TOKEN });

  const handleTransfer = async () => {
    await transfer({ to: "0xRecipient", amount: 100n });
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

The `matchZamaError` helper maps SDK error codes to user-friendly messages. See the [Error Handling guide](./handle-errors.md) for the full list of error types.

## Transfer into a contract (receiver hook)

Sometimes the recipient is a contract that needs to _react_ to the transfer — for example a confidential vault that credits a deposit, or a payment splitter that fans the amount out. `confidentialTransferAndCall` moves the encrypted amount **and** invokes the recipient's ERC-7984 receiver hook in a single transaction, so the deposit can never land without the contract being told about it.

Use `token.confidentialTransferAndCall()` (or the `useConfidentialTransferAndCall` hook). The third argument, `data`, is an opaque payload forwarded verbatim to the receiver's hook. The SDK never encodes, validates, or inspects it — its layout is defined by the receiving contract's ABI, not the token's. Encode it with viem's `encodeAbiParameters` to match what the contract expects.

This example deposits `500` confidential tokens into a vault, passing the depositor's account so the vault credits the right balance:

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { encodeAbiParameters } from "viem";

const VAULT = "0xVaultAddress";

// Shape must match the vault's receiver hook signature.
const data = encodeAbiParameters([{ type: "address" }], ["0xDepositorAccount"]);

const { txHash } = await token.confidentialTransferAndCall(VAULT, 500n, data);
console.log("Deposit tx:", txHash);
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useConfidentialTransferAndCall } from "@zama-fhe/react-sdk";
import { encodeAbiParameters } from "viem";

const VAULT = "0xVaultAddress";

const { mutateAsync: depositAndCall } = useConfidentialTransferAndCall({
  address: "0xEncryptedERC20Address",
});

const data = encodeAbiParameters([{ type: "address" }], ["0xDepositorAccount"]);

await depositAndCall({ to: VAULT, amount: 500n, data });
```

{% endtab %}
{% endtabs %}

Like `confidentialTransfer`, this validates the confidential balance before submitting and throws `InsufficientConfidentialBalanceError` if it is too low — catching an over-deposit before you spend gas on a transfer the vault would revert. Leave the check on for ordinary wallets; only set `skipBalanceCheck: true` for smart wallets that cannot produce the EIP-712 signature the decrypt-and-compare requires. (This is the same escape hatch introduced for `confidentialTransfer` above, not a per-deposit toggle.)

To deposit on behalf of an owner who has approved you as an operator, use `confidentialTransferFromAndCall(owner, vault, amount, data)` — the operator-initiated counterpart, mirroring `confidentialTransferFrom`.

{% hint style="warning" %}
A confirmed transaction means the receiver hook **ran**, not that your deposit has **settled**. A vault that queues or batches deposits may accept the call and credit your balance later. Don't treat the mined receipt as proof of settlement — read the vault's own state (or listen for its settlement event) before showing the user a final balance.
{% endhint %}

## Next steps

- [Shield Tokens](./shield-tokens.md) — convert public ERC-20 tokens into confidential form
- [Token.confidentialTransfer reference](../reference/sdk/Token.md#confidentialtransfer) — full API signature
- [useConfidentialTransfer reference](../reference/react/useConfidentialTransfer.md) — React hook details
- [useConfidentialTransferFrom reference](../reference/react/useConfidentialTransferFrom.md) — operator transfer hook
