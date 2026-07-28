---
title: Operator approvals
description: How to approve another address to act on your confidential tokens.
---

# Operator approvals

Operator approval lets another address (a DEX contract, multisig, or automated service) transfer confidential tokens on your behalf. This is the FHE equivalent of ERC-20's `approve` / `transferFrom` pattern. Use `token.setOperator()` in the core SDK, or the `useConfidentialSetOperator` hook in React.

## Steps

### 1. Approve an operator

Call `setOperator` with the operator address. By default, the approval is valid for 1 hour. The SDK sends a single on-chain transaction, after which the operator can call `confidentialTransferFrom` until the approval expires.

{% tabs %}
{% tab title="Core SDK" %}

```ts
const token = sdk.createToken("0xEncryptedERC20");

// Approve with the default 1-hour duration
await token.setOperator("0xOperator");
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useConfidentialSetOperator } from "@zama-fhe/react-sdk";

const { mutateAsync: setOperator, isPending } = useConfidentialSetOperator("0xEncryptedERC20");

// Approve with the default 1-hour duration
await setOperator({ operator: "0xOperator" });
```

{% endtab %}
{% endtabs %}

### 2. Approve with a custom expiry

Pass a Unix timestamp (in seconds) to set a longer or shorter approval window — `until` on the core method's second argument, or the `until` field on the hook variables:

{% tabs %}
{% tab title="Core SDK" %}

```ts
// Approve until a specific timestamp (e.g. 24 hours from now)
const expiry = Math.floor(Date.now() / 1000) + 86400;
await token.setOperator("0xOperator", expiry);
```

{% endtab %}
{% tab title="React" %}

```tsx
const expiry = Math.floor(Date.now() / 1000) + 86400;
await setOperator({ operator: "0xOperator", until: expiry });
```

{% endtab %}
{% endtabs %}

### 3. Check operator status

Query whether a spender is currently an approved operator. This returns `true` only if the approval is active and has not expired.

{% tabs %}
{% tab title="Core SDK" %}

```ts
// holder is the token owner, spender is the operator to check
const approved = await token.isOperator("0xHolder", "0xSpender");
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useConfidentialIsOperator } from "@zama-fhe/react-sdk";

const { data: approved } = useConfidentialIsOperator({
  address: "0xEncryptedERC20",
  holder: "0xHolder",
  spender: "0xSpender",
});
```

{% endtab %}
{% endtabs %}

### 4. Use operator transfer

Once approved, the operator can transfer tokens from the owner's confidential balance. The amount is encrypted before submission, just like a regular `confidentialTransfer` — on-chain observers see the transaction but not the value.

{% tabs %}
{% tab title="Core SDK" %}

```ts
// As the approved operator
const token = sdk.createToken("0xEncryptedERC20");

await token.confidentialTransferFrom("0xFrom", "0xTo", 500n);
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useConfidentialTransferFrom } from "@zama-fhe/react-sdk";

const { mutateAsync: transferFrom } = useConfidentialTransferFrom("0xEncryptedERC20");

await transferFrom({ from: "0xFrom", to: "0xTo", amount: 500n });
```

{% endtab %}
{% endtabs %}

### 5. (React) Wire it into a component

Here is a complete panel that reads operator status and exposes approve and transfer actions:

```tsx
"use client";

import {
  useConfidentialSetOperator,
  useConfidentialIsOperator,
  useConfidentialTransferFrom,
} from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";

function OperatorPanel({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { address } = useAccount();
  const { mutateAsync: setOperator, isPending: isSettingOperator } =
    useConfidentialSetOperator(tokenAddress);

  const { data: isOperator } = useConfidentialIsOperator({
    address: tokenAddress,
    holder: address,
    spender: "0xOperator",
  });

  const { mutateAsync: transferFrom, isPending: isTransferring } =
    useConfidentialTransferFrom(tokenAddress);

  return (
    <div>
      <p>Operator approved: {isOperator ? "Yes" : "No"}</p>
      <button onClick={() => setOperator({ operator: "0xOperator" })} disabled={isSettingOperator}>
        Set Operator
      </button>
      <button
        onClick={() => transferFrom({ from: "0xOwner", to: "0xRecipient", amount: 500n })}
        disabled={isTransferring}
      >
        Transfer From
      </button>
    </div>
  );
}
```

### 6. Finalize-unwrap operator approval

Operator approval also applies to the unshield (unwrap + finalize) flow. If an operator needs to unshield tokens on the owner's behalf, the owner must approve the operator separately for this action. The approval mechanism is the same -- `token.setOperator("0xOperator")` -- and the operator can then call `unshield` or `unshieldAll` on the owner's tokens.

This is a distinct concern from transfer approval: approving an operator for transfers does not automatically allow them to unshield.

## Next steps

- [Token.setOperator](../reference/sdk/Token.md) -- full method signature and options
- [useConfidentialSetOperator](../reference/react/useConfidentialSetOperator.md) -- React hook reference
- [useConfidentialIsOperator](../reference/react/useConfidentialIsOperator.md) -- query hook reference
- [useConfidentialTransferFrom](../reference/react/useConfidentialTransferFrom.md) -- operator transfer hook reference
