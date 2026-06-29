---
title: Unshield tokens
description: Convert confidential tokens back to public ERC-20 by unshielding them.
---

# Unshield tokens

Unshielding converts encrypted tokens back into standard ERC-20 tokens that are visible on-chain. The process involves two on-chain steps (unwrap and finalize), but the SDK handles both in a single call.

## Steps

### 1. Unshield a specific amount

Call `wrappedToken.unshield()` with the amount you want to convert back to public tokens. The SDK submits the unwrap transaction, waits for the decryption proof, and then submits the finalize transaction.

By default, the SDK validates the confidential balance before submitting. If the balance is insufficient, it throws `InsufficientConfidentialBalanceError` before any transaction is sent. Pass `skipBalanceCheck: true` to bypass (e.g. for smart wallets that cannot produce EIP-712 signatures).

{% tabs %}
{% tab title="SDK" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK } from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { sepolia } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  storage,
  relayers: { [sepolia.id]: web() },
});
const sdk = new ZamaSDK(config);
const wrappedToken = sdk.createWrappedToken("0xWrappedEncryptedERC20");

const { txHash, receipt } = await wrappedToken.unshield(500n);
```

{% endtab %}
{% endtabs %}

The returned `txHash` is the finalize transaction hash. The `receipt` confirms on-chain completion.

### 2. Track progress with callbacks

Because unshielding involves two transactions with a waiting period in between, you can provide callbacks to keep your UI in sync with each phase.

{% tabs %}
{% tab title="SDK" %}

```ts
await wrappedToken.unshield(500n, {
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

If you want to convert all confidential tokens back to public, use `unshieldAll()`. It reads the current encrypted balance and unshields the full amount directly, without decrypting it first.

{% tabs %}
{% tab title="SDK" %}

```ts
await wrappedToken.unshieldAll();
```

{% endtab %}
{% endtabs %}

`unshieldAll()` accepts the same callback options as `unshield()`.

### 4. Handle interrupted unshields

If the user closes their browser between the unwrap and finalize steps, the unwrap is on-chain but the finalize has not happened yet. The SDK persists the unwrap transaction hash automatically when phase 1 is submitted and clears it once finalization confirms, so you only need to detect and resume the pending state on the next page load.

{% tabs %}
{% tab title="SDK" %}

```ts
// On next page load, check for a pending unshield
const pending = await wrappedToken.getPendingUnshield();
if (pending) {
  await wrappedToken.resumeUnshield(pending);
}
```

{% endtab %}
{% endtabs %}

The flow is:

1. **`getPendingUnshield`** -- returns the unwrap transaction hash of an interrupted unshield, or `null` if none is pending. The SDK saved it automatically during phase 1.
2. **`resumeUnshield`** -- picks up where the SDK left off by polling for the proof and submitting the finalize transaction. On success the SDK clears the persisted state for you.

Resuming is intentionally caller-driven: surface a "resume" prompt rather than finalizing on load, so you never trigger a wallet transaction the user did not initiate.

{% hint style="info" %}
For custom flows, the lower-level `savePendingUnshield`, `loadPendingUnshield`, and `clearPendingUnshield` helpers remain exported from `@zama-fhe/sdk`. You only need them if you bypass `unshield()` / `resumeUnshield()` and orchestrate `unwrap` + `finalizeUnwrap` yourself.
{% endhint %}

### 5. Use unshield hooks in React

The React SDK provides hooks that wrap the above operations with React Query mutation semantics.

{% tabs %}
{% tab title="useUnshield" %}

```tsx
import { useUnshield } from "@zama-fhe/react-sdk";

const { mutateAsync: unshield, isPending } = useUnshield("0xWrapper");

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

const { mutateAsync: unshieldAll } = useUnshieldAll("0xWrapper");

await unshieldAll();
```

{% endtab %}
{% tab title="useResumeUnshield" %}

```tsx
import { usePendingUnshield, useResumeUnshield } from "@zama-fhe/react-sdk";

const WRAPPER = "0xWrapper";

// The SDK persisted the unwrap tx hash during phase 1 and clears it
// automatically once the resume finalizes; the query invalidates on success.
const { data: unwrapTxHash } = usePendingUnshield(WRAPPER);
const { mutate: resumeUnshield } = useResumeUnshield(WRAPPER);

if (unwrapTxHash) {
  // Render a "resume" prompt — finalize on user action, not on load.
  return <button onClick={() => resumeUnshield({ unwrapTxHash })}>Resume unshield</button>;
}
```

{% endtab %}
{% endtabs %}

All mutation hooks automatically invalidate balance queries on success, so your UI stays in sync without manual cache management.

## Next steps

- See [WrappedToken](../reference/sdk/WrappedToken.md) for the full `WrappedToken.unshield` and `WrappedToken.unshieldAll` API.
- See [Hooks](../reference/react/query-keys.md) for `useUnshield`, `useUnshieldAll`, and `useResumeUnshield` details.
- If your unshield fails, see [Handle Errors](handle-errors.md) for troubleshooting `TransactionRevertedError` and related issues.
