---
title: Unshield tokens
description: Convert confidential tokens back to public ERC-20 by unshielding them.
---

# Unshield tokens

Unshielding converts encrypted tokens back into standard ERC-20 tokens that are visible on-chain. The process involves two on-chain steps (unwrap and finalize), but the SDK handles both in a single call — `wrappedToken.unshield()` in the core SDK, or the `useUnshield` hook in React.

## Steps

### 1. Unshield a specific amount

Call `unshield()` with the amount you want to convert back to public tokens. The SDK submits the unwrap transaction, waits for the decryption proof, and then submits the finalize transaction.

By default, the SDK validates the confidential balance before submitting. If the balance is insufficient, it throws `InsufficientConfidentialBalanceError` before any transaction is sent. Pass `skipBalanceCheck: true` to bypass (e.g. for smart wallets that cannot produce EIP-712 signatures).

{% tabs %}
{% tab title="Core SDK" %}

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
{% tab title="React SDK" %}

```tsx
import { useUnshield } from "@zama-fhe/react-sdk";

const { mutateAsync: unshield, isPending } = useUnshield("0xWrappedEncryptedERC20");

const { txHash, receipt } = await unshield({ amount: 500n });
```

{% endtab %}
{% endtabs %}

The returned `txHash` is the finalize transaction hash. The `receipt` confirms on-chain completion.

### 2. Track progress with callbacks

Because unshielding involves two transactions with a waiting period in between, you can provide callbacks to keep your UI in sync with each phase.

{% tabs %}
{% tab title="Core SDK" %}

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
{% tab title="React SDK" %}

```tsx
import { useUnshield } from "@zama-fhe/react-sdk";

const { mutateAsync: unshield } = useUnshield("0xWrappedEncryptedERC20");

await unshield({
  amount: 500n,
  onUnwrapSubmitted: (txHash) => console.log("Step 1:", txHash),
  onFinalizing: () => console.log("Waiting for proof..."),
  onFinalizeSubmitted: (txHash) => console.log("Done:", txHash),
});
```

{% endtab %}
{% endtabs %}

Callbacks are safe to use -- if one throws, the unshield still completes. The typical timeline is:

1. **`onUnwrapSubmitted`** -- fires when the first transaction is mined.
2. **`onFinalizing`** -- fires while the SDK polls for the decryption proof (this can take several seconds).
3. **`onFinalizeSubmitted`** -- fires when the second transaction is mined and the tokens are public again.

### 3. Unshield your entire balance

If you want to convert all confidential tokens back to public, use `unshieldAll()`. It reads the current encrypted balance and unshields the full amount directly, without decrypting it first. It accepts the same lifecycle **callbacks** as `unshield()` — but not the `skipBalanceCheck` option from step 1, which is specific to `unshield()`.

{% tabs %}
{% tab title="Core SDK" %}

```ts
await wrappedToken.unshieldAll();
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useUnshieldAll } from "@zama-fhe/react-sdk";

const { mutateAsync: unshieldAll } = useUnshieldAll("0xWrappedEncryptedERC20");

await unshieldAll();
```

{% endtab %}
{% endtabs %}

### 4. Handle interrupted unshields

If the user closes their browser between the unwrap and finalize steps, the unwrap is on-chain but the finalize has not happened yet. The SDK persists the unwrap transaction hash automatically when phase 1 is submitted and clears it once finalization confirms, so you only need to detect and resume the pending state on the next page load.

Resuming is intentionally caller-driven: surface a "resume" prompt rather than finalizing on load, so you never trigger a wallet transaction the user did not initiate.

{% tabs %}
{% tab title="Core SDK" %}

```ts
// On next page load, check for a pending unshield
const pending = await wrappedToken.getPendingUnshield();
if (pending) {
  await wrappedToken.resumeUnshield(pending);
}
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { usePendingUnshield, useResumeUnshield } from "@zama-fhe/react-sdk";

const WRAPPER = "0xWrappedEncryptedERC20";

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

The flow is:

1. **`getPendingUnshield`** -- returns the unwrap transaction hash of an interrupted unshield, or `null` if none is pending. The SDK saved it automatically during phase 1 and verifies it on-chain before reporting it: a pointer whose request was already finalized is cleared and `null` comes back, so a stale entry never shows a resume prompt.
2. **`resumeUnshield`** -- picks up where the SDK left off by polling for the proof and submitting the finalize transaction. On success the SDK clears the persisted state for you.

{% hint style="warning" %}
**A resume can lose the race** Another tab, a double click, or a third party can finalize the same request first. `resumeUnshield` then clears the persisted state and throws `UnshieldAlreadyFinalizedError` instead of broadcasting a transaction that would revert. Treat the error as completion: the funds already arrived, so dismiss the prompt and refresh balances. `useResumeUnshield` refreshes the affected queries automatically. See [UnshieldAlreadyFinalizedError](../reference/sdk/errors.md#unshieldalreadyfinalizederror).
{% endhint %}

{% hint style="info" %}
The SDK persists and clears the pending-unshield state for you — there are no storage helpers to call by hand. `getPendingUnshield()` (read) and `unshield()` / `resumeUnshield()` (orchestrated write) are the full surface. If you orchestrate `unwrap` + `finalizeUnwrap` yourself, manage your own persistence between the two phases. React mutation hooks automatically invalidate balance queries on success, so your UI stays in sync without manual cache management.
{% endhint %}

### 5. Decompose the unshield into explicit phases

`unshield()` orchestrates both on-chain steps for you and should be your default. Drop down to the low-level primitives only when you genuinely need per-phase control -- for example, to submit the unwrap now and let the user finalize later from a different screen.

- **`unwrap(amount)`** (or **`unwrapAll()`**) submits phase 1 and returns an `UnwrapResult`: the `txHash`, mined `receipt`, and the `unwrapRequestId` needed for phase 2.
- **`finalizeUnwrap(unwrapRequestId)`** fetches the public decryption proof and submits phase 2.

{% tabs %}
{% tab title="Core SDK" %}

```ts
// Phase 1: request the unwrap on-chain
const { unwrapRequestId } = await wrappedToken.unwrap(500n);

// ...later, once the request has been processed on-chain

// Phase 2: fetch the decryption proof and finalize
await wrappedToken.finalizeUnwrap(unwrapRequestId);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useUnwrap, useFinalizeUnwrap } from "@zama-fhe/react-sdk";

const unwrap = useUnwrap("0xWrapper");
const finalize = useFinalizeUnwrap("0xWrapper");

// Phase 1 -- the mutation `data` is an UnwrapResult
const result = await unwrap.mutateAsync({ amount: 500n });

// Phase 2 -- the result's unwrapRequestId feeds straight in
await finalize.mutateAsync(result);
```

{% endtab %}
{% endtabs %}

Use `unwrapAll()` / `useUnwrapAll` in place of `unwrap` / `useUnwrap` to request the full confidential balance instead of a fixed amount.

{% hint style="warning" %}
When you drive the two phases yourself, you own the state between them. `getPendingUnshield()` and `resumeUnshield()` only track unshields started through `unshield()` -- they will not pick up an `unwrap` you submitted directly. Persist the `unwrapRequestId` yourself if the session might end before you finalize.
{% endhint %}

## Next steps

- See [WrappedToken](../reference/sdk/WrappedToken.md) for the full `WrappedToken.unshield` and `WrappedToken.unshieldAll` API.
- See [Hooks](../reference/react/query-keys.md) for `useUnshield`, `useUnshieldAll`, `useResumeUnshield`, and the low-level `useUnwrap` / `useUnwrapAll` / `useFinalizeUnwrap` details.
- If your unshield fails, see [Handle Errors](handle-errors.md) for troubleshooting `TransactionRevertedError` and related issues.
