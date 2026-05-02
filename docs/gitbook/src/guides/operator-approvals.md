---
title: Operator approvals
description: How to approve another address to act on your confidential tokens.
---

# Operator approvals

Operator approval lets another address (a DEX contract, multisig, or automated service) transfer confidential tokens on your behalf. This is the FHE equivalent of ERC-20's `approve` / `transferFrom` pattern.

## Steps

### 1. Approve an operator

Call `setOperator` on a token instance. By default, the approval is valid for 1 hour:

```ts
const token = sdk.createToken("0xEncryptedERC20");

// Approve with the default 1-hour duration
await token.setOperator("0xOperator");
```

The SDK sends a single on-chain transaction. The operator can call `confidentialTransferFrom` until the approval expires.

### 2. Approve with a custom expiry

Pass a Unix timestamp (in seconds) as the second argument to set a longer or shorter approval window:

```ts
// Approve until a specific timestamp (e.g. 24 hours from now)
const expiry = Math.floor(Date.now() / 1000) + 86400;
await token.setOperator("0xOperator", expiry);
```

### 3. Check operator status

Query whether a spender is currently an approved operator:

```ts
// holder is the token owner, spender is the operator to check
const approved = await token.isOperator("0xHolder", "0xSpender");
// returns true if the approval is active and has not expired
```

### 4. Use operator transfer

Once approved, the operator can transfer tokens from the owner's confidential balance:

```ts
// As the approved operator
const token = sdk.createToken("0xEncryptedERC20");

await token.confidentialTransferFrom("0xFrom", "0xTo", 500n);
```

The amount is encrypted before submission, just like a regular `confidentialTransfer`. On-chain observers see the transaction but not the value.

### 5. React: use the operator hooks

The React SDK provides hooks that wrap these operations with loading states and error handling:

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
  const { mutateAsync: setOperator, isPending: isSettingOperator } = useConfidentialSetOperator({
    tokenAddress,
  });

  const { data: isOperator } = useConfidentialIsOperator({
    tokenAddress,
    holder: address,
    spender: "0xOperator",
  });

  const { mutateAsync: transferFrom, isPending: isTransferring } = useConfidentialTransferFrom({
    tokenAddress,
  });

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

- [Token.setOperator](/reference/sdk/Token) -- full method signature and options
- [useConfidentialSetOperator](/reference/react/useConfidentialSetOperator) -- React hook reference
- [useConfidentialIsOperator](/reference/react/useConfidentialIsOperator) -- query hook reference
- [useConfidentialTransferFrom](/reference/react/useConfidentialTransferFrom) -- operator transfer hook reference
