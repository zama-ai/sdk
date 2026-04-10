---
title: Shield Tokens
description: How to convert public ERC-20 tokens into their confidential form.
---

# Shield Tokens

Shielding converts public ERC-20 tokens into confidential tokens. The SDK handles the ERC-20 approval and the shield transaction in a single call via `token.shield()`. In React, use the `useShield` hook.

## Steps

### 1. Create a token instance

Start from a configured SDK instance (see [Configuration](/guides/configuration)) and create a token pointing at your encrypted ERC-20 contract.

Some deployments use a **wrapper contract** that is separate from the token contract itself. If your setup has a separate wrapper address, pass it as the second argument to `createToken` or as `wrapperAddress` in hooks. If the token _is_ the wrapper (single-contract deployments), you can omit it.

You can resolve the wrapper address on-chain using the built-in registry:

{% tabs %}
{% tab title="Core SDK" %}

```ts
// Single-contract deployment (token is the wrapper)
const token = sdk.createToken("0xEncryptedERC20Address");

// Separate wrapper — pass it explicitly
const tokenWithWrapper = sdk.createToken("0xTokenAddress", "0xWrapperAddress");
```

{% endtab %}
{% tab title="Resolve wrapper via registry" %}

```ts
// The registry resolves the confidential wrapper for any registered ERC-20.
// On Mainnet, Sepolia, and Hoodi the registry address is built-in.
const result = await sdk.registry.getConfidentialToken("0xTokenAddress");
if (!result) throw new Error("No wrapper registered for this token");

const token = sdk.createToken("0xTokenAddress", result.confidentialTokenAddress);
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useToken } from "@zama-fhe/react-sdk";

// Without wrapper (single-contract)
const token = useToken({ tokenAddress: "0xEncryptedERC20Address" });

// With separate wrapper
const tokenWithWrapper = useToken({
  tokenAddress: "0xTokenAddress",
  wrapperAddress: "0xWrapperAddress",
});
```

{% endtab %}
{% endtabs %}

### 2. Shield with exact approval (default)

The SDK always validates the ERC-20 balance before submitting. If the balance is insufficient, it throws `InsufficientERC20BalanceError` with `requested`, `available`, and `token` properties -- no transaction is sent. This is a public read with no signing requirement, so it works for all wallet types including smart wallets.

By default, `shield` approves the exact amount before wrapping. This is the safest option — it limits exposure if the contract is compromised:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { txHash } = await token.shield(1000n);
console.log("Shield tx:", txHash);
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useShield } from "@zama-fhe/react-sdk";

const { mutateAsync: shield, isPending } = useShield({
  tokenAddress: "0xEncryptedERC20Address",
  wrapperAddress: "0xWrapperAddress", // omit if token is the wrapper
});

const txHash = await shield({ amount: 1000n });
```

{% endtab %}
{% endtabs %}

The SDK sends two transactions: an ERC-20 `approve` for 1000 tokens, followed by the shield (wrap) call. The user sees two wallet prompts.

### 3. Shield with max approval

To avoid a separate approval transaction every time, pass `approvalStrategy: "max"`. This grants an unlimited allowance on the first shield, and subsequent shields skip the approval step:

{% tabs %}
{% tab title="Core SDK" %}

```ts
// First call: approve(MAX_UINT256) + shield — two wallet prompts
await token.shield(1000n, { approvalStrategy: "max" });

// Second call: only the shield tx — one wallet prompt
await token.shield(500n, { approvalStrategy: "max" });
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
await token.shield(1000n, { approvalStrategy: "skip" });
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

Both the core SDK and React hooks return the transaction hash. You can use it to wait for confirmation or show progress in your UI:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { txHash } = await token.shield(1000n);

// Wait for confirmation using your signer
const receipt = await signer.waitForTransactionReceipt(txHash);
console.log("Confirmed in block:", receipt.blockNumber);
```

{% endtab %}
{% tab title="React" %}

```tsx
const {
  mutateAsync: shield,
  isPending,
  isSuccess,
} = useShield({
  tokenAddress: "0xEncryptedERC20Address",
  wrapperAddress: "0xWrapperAddress", // omit if token is the wrapper
});

// isPending is true while the transaction is in flight
// isSuccess flips to true when the mutation completes
// Balance caches are automatically invalidated on success
const txHash = await shield({ amount: 1000n });
```

{% endtab %}
{% endtabs %}

In React, balance caches are automatically invalidated after a successful shield. The `useConfidentialBalance` hook will pick up the new balance on its next poll cycle.

## Next steps

- [Transfer Privately](/guides/transfer-privately) — send confidential tokens to another address
- [Token.shield reference](/reference/sdk/Token#shield) — full API signature and options
- [useShield reference](/reference/react/useShield) — React hook details
