---
title: Shield tokens
description: How to convert public ERC-20 tokens into their confidential form.
---

# Shield tokens

Shielding converts public ERC-20 tokens into confidential tokens. The SDK handles the ERC-20 approval and the shield transaction in a single call via `wrappedToken.shield()`. In React, use the `useShield` hook.

## Shielding paths

`WrappedToken.shield()` exposes a single API but routes through one of two on-chain paths depending on the underlying ERC-20:

| Path               | Triggered when                                | Wallet prompts | Notes                                                                                 |
| ------------------ | --------------------------------------------- | -------------- | ------------------------------------------------------------------------------------- |
| `transferAndCall`  | Underlying ERC-20 implements ERC-1363         | 1              | The wrapper's `onTransferReceived` mints the confidential balance in one transaction. |
| `approve` + `wrap` | Underlying ERC-20 does not implement ERC-1363 | 2              | An ERC-20 `approve` followed by a `wrap` call on the wrapper.                         |

The SDK detects ERC-1363 support automatically via ERC-165 `supportsInterface` against the underlying token. **You don't need to choose a path or detect ERC-1363 yourself** — `wrappedToken.shield(amount)` routes correctly for any wrapper. `approvalStrategy` only applies to the `approve` + `wrap` path; on the `transferAndCall` path there is no allowance step.

### Which path will my token take?

Among the wrapped tokens registered on Ethereum mainnet today, the routing is:

| Confidential wrapper | Underlying | Shield path                   |
| -------------------- | ---------- | ----------------------------- |
| cTGBP                | tGBP       | `transferAndCall` (single tx) |
| cZAMA                | ZAMA       | `transferAndCall` (single tx) |
| cUSDC                | USDC       | `approve` + `wrap` (two txs)  |
| cUSDT                | USDT       | `approve` + `wrap` (two txs)  |
| cWETH                | WETH       | `approve` + `wrap` (two txs)  |
| cBRON                | BRON       | `approve` + `wrap` (two txs)  |

ERC-1363 is a conditional optimisation, not a recommended new default — only a small subset of tokens implement it today. Tokens that don't (USDC, USDT, DAI, and most existing ERC-20s) continue to use `approve` + `wrap`. Any newly deployed wrapper picks up the `transferAndCall` path automatically if its underlying ERC-20 implements ERC-1363 — no opt-in is required from your code. See the [`WrappersRegistry` reference](../reference/sdk/WrappersRegistry.md) for how to look up the wrapper for a given ERC-20.

## Steps

### 1. Create a wrapped-token instance

Start from a configured SDK instance (see [Configuration](./configuration.md)) and create a `WrappedToken` pointing at your confidential wrapper contract. The wrapper _is_ the confidential token: `createWrappedToken(addr)` takes a single address — the wrapper's own address.

If you only have the underlying ERC-20 address, the built-in registry resolves the matching wrapper.

{% tabs %}
{% tab title="Core SDK" %}

```ts
const wrappedToken = sdk.createWrappedToken("0xWrapperAddress");
```

{% endtab %}
{% tab title="Resolve wrapper via registry" %}

```ts
// The registry resolves the confidential wrapper for any registered ERC-20.
// On Mainnet, Sepolia, and Hoodi the registry address is built-in.
const result = await sdk.registry.getConfidentialToken("0xUnderlyingERC20");
if (!result) throw new Error("No wrapper registered for this token");

const wrappedToken = sdk.createWrappedToken(result.confidentialTokenAddress);
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useWrappedToken } from "@zama-fhe/react-sdk";

const wrappedToken = useWrappedToken("0xWrapperAddress");
```

{% endtab %}
{% endtabs %}

### 2. Shield with exact approval (default)

The SDK always validates the ERC-20 balance before submitting. If the balance is insufficient, it throws `InsufficientERC20BalanceError` with `requested`, `available`, and `token` properties -- no transaction is sent. This is a public read with no signing requirement, so it works for all wallet types including smart wallets.

By default, `shield` approves the exact amount before wrapping. This is the safest option — it limits exposure if the contract is compromised:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { txHash } = await wrappedToken.shield(1000n);
console.log("Shield tx:", txHash);
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useShield } from "@zama-fhe/react-sdk";

const { mutateAsync: shield, isPending } = useShield({ address: "0xWrapperAddress" });

const { txHash } = await shield({ amount: 1000n });
```

{% endtab %}
{% endtabs %}

On the `approve` + `wrap` path, the SDK sends two transactions: an ERC-20 `approve` for 1000 tokens, followed by the shield (wrap) call. The user sees two wallet prompts. On the `transferAndCall` path (ERC-1363 underlyings), shielding completes in a single transaction and `approvalStrategy` doesn't apply — see [Shielding paths](#shielding-paths) for details.

### 3. Shield with max approval

`approvalStrategy` only affects the `approve` + `wrap` path; on `transferAndCall` it's ignored. To avoid a separate approval transaction every time on `approve` + `wrap` tokens, pass `approvalStrategy: "max"`. This grants an unlimited allowance on the first shield, and subsequent shields skip the approval step:

{% tabs %}
{% tab title="Core SDK" %}

```ts
// First call: approve(MAX_UINT256) + shield — two wallet prompts
await wrappedToken.shield(1000n, { approvalStrategy: "max" });

// Second call: only the shield tx — one wallet prompt
await wrappedToken.shield(500n, { approvalStrategy: "max" });
```

{% endtab %}
{% tab title="React" %}

```tsx
await shield({ amount: 1000n, approvalStrategy: "max" });
```

{% endtab %}
{% endtabs %}

### 4. Shield with skip approval

If the user has already approved the wrapper contract (for example, through a separate UI flow), you can skip the approval check entirely:

{% tabs %}
{% tab title="Core SDK" %}

```ts
await wrappedToken.shield(1000n, { approvalStrategy: "skip" });
```

{% endtab %}
{% tab title="React" %}

```tsx
await shield({ amount: 1000n, approvalStrategy: "skip" });
```

{% endtab %}
{% endtabs %}

This sends only the shield transaction. If the allowance is insufficient, the transaction reverts on-chain.

### 5. Track the transaction

Both the core SDK and React hooks resolve to a `TransactionResult` with the transaction `txHash` and its mined `receipt`. Use them to wait for confirmation or show progress in your UI:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { txHash } = await wrappedToken.shield(1000n);

// Wait for confirmation using your provider
const receipt = await sdk.provider.waitForTransactionReceipt(txHash);
console.log("Confirmed in block:", receipt.blockNumber);
```

{% endtab %}
{% tab title="React" %}

```tsx
const { mutateAsync: shield, isPending, isSuccess } = useShield({ address: "0xWrapperAddress" });

// isPending is true while the transaction is in flight
// isSuccess flips to true when the mutation completes
// Balance caches are automatically invalidated on success
const { txHash } = await shield({ amount: 1000n });
```

{% endtab %}
{% endtabs %}

In React, balance caches are automatically invalidated after a successful shield. The `useConfidentialBalance` hook will pick up the new balance on its next poll cycle.

## Manual approve + wrap (escape hatch)

`shield()` bundles approval and wrapping into one call and is what almost every app should use. If you need to split the `approve` + `wrap` path across two separately-triggered signatures — for example to render distinct "approve" and "shield" steps in your own UI, or to approve well ahead of the wrap — call `approveUnderlying()` and `wrap()` directly.

This applies only to the `approve` + `wrap` path. Don't use it to recreate `shield()` by hand: `wrap()` never sends `transferAndCall`, so you lose automatic ERC-1363 routing along with the `approvalStrategy` handling.

{% tabs %}
{% tab title="Core SDK" %}

```ts
// 1. Approve the wrapper to spend the underlying ERC-20 (first signature).
await wrappedToken.approveUnderlying(1000n);

// 2. Wrap the approved amount into confidential tokens (second signature).
const { txHash } = await wrappedToken.wrap(1000n);
```

{% endtab %}
{% tab title="React" %}

```tsx
const approve = useApproveUnderlying("0xWrapperAddress");
const wrap = useWrap("0xWrapperAddress");

await approve.mutateAsync({ amount: 1000n });
await wrap.mutateAsync({ amount: 1000n });
```

{% endtab %}
{% endtabs %}

`wrap()` validates the ERC-20 balance and the current allowance before submitting: it throws `InsufficientERC20BalanceError` if the balance is too low, and `InsufficientAllowanceError` if the wrapper is not approved for the amount (call `approveUnderlying()` first). Pass `{ to }` to mint the confidential balance to a different recipient.

## Next steps

- [Transfer Privately](./transfer-privately.md) — send confidential tokens to another address
- [WrappedToken.shield reference](../reference/sdk/WrappedToken.md#shield) — full API signature and options
- [useShield reference](../reference/react/useShield.md) — React hook details
