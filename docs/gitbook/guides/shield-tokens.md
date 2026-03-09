---
title: Shield Tokens
description: How to convert public ERC-20 tokens into their confidential form.
---

# Shield Tokens

Shielding converts public ERC-20 tokens into confidential tokens. The SDK handles the ERC-20 approval and the shield transaction in a single call via `token.shield()`. In React, use the `useShield` and `useShieldETH` hooks.

## Steps

### 1. Create a token instance

Start from a configured SDK instance (see [Configuration](/guides/configuration)) and create a token pointing at your encrypted ERC-20 contract.

Some deployments use a **wrapper contract** that is separate from the token contract itself. If your setup has a separate wrapper address, pass it as the second argument to `createToken` or as `wrapperAddress` in hooks. If the token _is_ the wrapper (single-contract deployments), you can omit it.

You can resolve the wrapper address on-chain using the `readWrapperForTokenContract` helper:

::: code-group

```ts [Core SDK]
// Single-contract deployment (token is the wrapper)
const token = sdk.createToken("0xEncryptedERC20Address"); // [!code focus]

// Separate wrapper — pass it explicitly
const token = sdk.createToken("0xTokenAddress", "0xWrapperAddress"); // [!code focus]
```

```ts [Resolve wrapper on-chain (viem)]
import { readWrapperForTokenContract } from "@zama-fhe/sdk/viem";

const wrapperAddress = await readWrapperForTokenContract(
  publicClient,
  "0xCoordinatorAddress",
  "0xTokenAddress",
);
const token = sdk.createToken("0xTokenAddress", wrapperAddress);
```

```ts [Resolve wrapper on-chain (ethers)]
import { readWrapperForTokenContract } from "@zama-fhe/sdk/ethers";

const wrapperAddress = await readWrapperForTokenContract(
  provider,
  "0xCoordinatorAddress",
  "0xTokenAddress",
);
const token = sdk.createToken("0xTokenAddress", wrapperAddress);
```

```tsx [React]
import { useToken } from "@zama-fhe/react-sdk";

// Without wrapper (single-contract)
const token = useToken({ tokenAddress: "0xEncryptedERC20Address" }); // [!code focus]

// With separate wrapper
const token = useToken({ tokenAddress: "0xTokenAddress", wrapperAddress: "0xWrapperAddress" }); // [!code focus]
```

:::

### 2. Shield with exact approval (default)

By default, `shield` approves the exact amount before wrapping. This is the safest option — it limits exposure if the contract is compromised:

::: code-group

```ts [Core SDK]
const { txHash } = await token.shield(1000n); // [!code focus]
console.log("Shield tx:", txHash);
```

```tsx [React]
import { useShield } from "@zama-fhe/react-sdk";

const { mutateAsync: shield, isPending } = useShield({
  tokenAddress: "0xEncryptedERC20Address",
  wrapperAddress: "0xWrapperAddress", // omit if token is the wrapper
});

const txHash = await shield({ amount: 1000n }); // [!code focus]
```

:::

The SDK sends two transactions: an ERC-20 `approve` for 1000 tokens, followed by the shield (wrap) call. The user sees two wallet prompts.

### 3. Shield with max approval

To avoid a separate approval transaction every time, pass `approvalStrategy: "max"`. This grants an unlimited allowance on the first shield, and subsequent shields skip the approval step:

::: code-group

```ts [Core SDK]
// First call: approve(MAX_UINT256) + shield — two wallet prompts
await token.shield(1000n, { approvalStrategy: "max" }); // [!code focus]

// Second call: only the shield tx — one wallet prompt
await token.shield(500n, { approvalStrategy: "max" });
```

```tsx [React]
await shield({ amount: 1000n, approvalStrategy: "max" }); // [!code focus]
```

:::

### 4. Shield with skip approval

If the user has already approved the wrapper contract (for example, through a separate UI flow), you can skip the approval check entirely:

::: code-group

```ts [Core SDK]
await token.shield(1000n, { approvalStrategy: "skip" }); // [!code focus]
```

```tsx [React]
await shield({ amount: 1000n, approvalStrategy: "skip" }); // [!code focus]
```

:::

This sends only the shield transaction. If the allowance is insufficient, the transaction reverts on-chain.

### 5. Shield native ETH

For ETH wrapper contracts that accept native ETH, use `shieldETH` instead. No ERC-20 approval is needed — the ETH value is sent directly with the transaction:

::: code-group

```ts [Core SDK]
await token.shieldETH(1000n); // [!code focus]
```

```tsx [React]
import { useShieldETH } from "@zama-fhe/react-sdk";

const { mutateAsync: shieldETH } = useShieldETH({
  tokenAddress: "0xEncryptedERC20Address",
  wrapperAddress: "0xWrapperAddress", // omit if token is the wrapper
});

await shieldETH({ amount: 1000n }); // [!code focus]
```

:::

### 6. Track the transaction

Both the core SDK and React hooks return the transaction hash. You can use it to wait for confirmation or show progress in your UI:

::: code-group

```ts [Core SDK]
const { txHash } = await token.shield(1000n);

// Wait for confirmation using your signer
const receipt = await signer.waitForTransactionReceipt(txHash);
console.log("Confirmed in block:", receipt.blockNumber);
```

```tsx [React]
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

:::

In React, balance caches are automatically invalidated after a successful shield. The `useConfidentialBalance` hook will pick up the new balance on its next poll cycle.

For fee-aware shielding, you can query the shield fee before submitting the transaction using `useShieldFee` in React or the fee manager contract directly in the core SDK.

## Next steps

- [Transfer Privately](/guides/transfer-privately) — send confidential tokens to another address
- [Token.shield reference](/reference/sdk/Token#shield) — full API signature and options
- [useShield reference](/reference/react/useShield) — React hook details
- [useShieldETH reference](/reference/react/useShieldETH) — React hook for native ETH shielding
