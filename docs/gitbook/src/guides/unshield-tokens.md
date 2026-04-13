---
title: Unshield tokens
description: Convert confidential tokens back to public ERC-20 by unshielding them.
---

# Unshield tokens

Unshielding converts encrypted tokens back into standard ERC-20 tokens that are visible on-chain. The process involves two on-chain steps (unwrap and finalize), but the SDK handles both in a single call.

## Steps

### 1. Unshield a specific amount

Call `token.unshield()` with the amount you want to convert back to public tokens. The SDK submits the unwrap transaction, waits for the decryption proof, and then submits the finalize transaction.

By default, the SDK validates the confidential balance before submitting. If the balance is insufficient, it throws `InsufficientConfidentialBalanceError` before any transaction is sent. Pass `skipBalanceCheck: true` to bypass (e.g. for smart wallets that cannot produce EIP-712 signatures).

{% tabs %}
{% tab title="SDK" %}

```ts
import { ZamaSDK } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({ relayer, signer, storage });
const token = sdk.createToken("0xEncryptedERC20");

const { txHash, receipt } = await token.unshield(500n);
```

{% endtab %}
{% endtabs %}

The returned `txHash` is the finalize transaction hash. The `receipt` confirms on-chain completion.

### 2. Track progress with callbacks

Because unshielding involves two transactions with a waiting period in between, you can provide callbacks to keep your UI in sync with each phase.

{% tabs %}
{% tab title="SDK" %}

```ts
await token.unshield(500n, {
  onUnwrapSubmitted: (txHash) => {
    updateUI("Unwrap submitted...");
  },
  onFinalizing: () => {
    updateUI("Waiting for decryption proof...");
  },
  onFinalizeSubmitted: (txHash) => {
    updateUI("Unshield complete!");
  },
});
```

{% endtab %}
{% endtabs %}

Callbacks are safe to use -- if one throws, the unshield still completes. The typical timeline is:

1. **`onUnwrapSubmitted`** -- fires when the first transaction is mined.
2. **`onFinalizing`** -- fires while the SDK polls for the decryption proof (this can take several seconds).
3. **`onFinalizeSubmitted`** -- fires when the second transaction is mined and the tokens are public again.

### 3. Unshield your entire balance

If you want to convert all confidential tokens back to public, use `unshieldAll()`. It reads the current encrypted balance, decrypts it, and unshields the full amount.

{% tabs %}
{% tab title="SDK" %}

```ts
await token.unshieldAll();
```

{% endtab %}
{% endtabs %}

`unshieldAll()` accepts the same callback options as `unshield()`.

### 4. Handle interrupted unshields

If the user closes their browser between the unwrap and finalize steps, the unwrap is on-chain but the finalize has not happened yet. You can detect and resume this state on the next page load.

{% tabs %}
{% tab title="SDK" %}

```ts
import { savePendingUnshield, loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/sdk";

// Before finalization, persist the unwrap tx hash
await savePendingUnshield(storage, wrapperAddress, unwrapTxHash);

// On next page load, check for pending unshields
const pending = await loadPendingUnshield(storage, wrapperAddress);
if (pending) {
  await token.resumeUnshield(pending);
  await clearPendingUnshield(storage, wrapperAddress);
}
```

{% endtab %}
{% endtabs %}

The flow is:

1. **`savePendingUnshield`** -- write the unwrap transaction hash to storage before the finalize step. The SDK does not do this automatically.
2. **`loadPendingUnshield`** -- on mount, check if there is an incomplete unshield.
3. **`resumeUnshield`** -- pick up where the SDK left off by polling for the proof and submitting the finalize transaction.
4. **`clearPendingUnshield`** -- clean up storage once finalization is confirmed.

### 5. Use unshield hooks in React

The React SDK provides hooks that wrap the above operations with React Query mutation semantics.

{% tabs %}
{% tab title="useUnshield" %}

```tsx
import { useUnshield } from "@zama-fhe/react-sdk";

const { mutateAsync: unshield, isPending } = useUnshield({
  tokenAddress: "0xToken",
  wrapperAddress: "0xWrapper", // omit if token is the wrapper
});

await unshield({
  amount: 500n,
  onUnwrapSubmitted: (txHash) => console.log("Step 1:", txHash),
  onFinalizing: () => console.log("Waiting for proof..."),
  onFinalizeSubmitted: (txHash) => console.log("Done:", txHash),
});
```

{% endtab %}
{% tab title="useUnshieldAll" %}

```tsx
import { useUnshieldAll } from "@zama-fhe/react-sdk";

const { mutateAsync: unshieldAll } = useUnshieldAll({
  tokenAddress: "0xToken",
  wrapperAddress: "0xWrapper", // omit if token is the wrapper
});

await unshieldAll();
```

{% endtab %}
{% tab title="useResumeUnshield" %}

```tsx
import { useResumeUnshield } from "@zama-fhe/react-sdk";
import { loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/react-sdk";

const { mutateAsync: resumeUnshield } = useResumeUnshield({
  tokenAddress: "0xToken",
  wrapperAddress: "0xWrapper", // omit if token is the wrapper
});

// On mount
const pending = await loadPendingUnshield(storage, wrapperAddress);
if (pending) {
  await resumeUnshield({ unwrapTxHash: pending });
  await clearPendingUnshield(storage, wrapperAddress);
}
```

{% endtab %}
{% endtabs %}

All mutation hooks automatically invalidate balance queries on success, so your UI stays in sync without manual cache management.

## Next steps

- See [Token Operations](/reference/sdk/Token) for the full `Token.unshield` and `Token.unshieldAll` API.
- See [Hooks](/reference/react/query-keys) for `useUnshield`, `useUnshieldAll`, and `useResumeUnshield` details.
- If your unshield fails, see [Handle Errors](handle-errors.md) for troubleshooting `TransactionRevertedError` and related issues.
