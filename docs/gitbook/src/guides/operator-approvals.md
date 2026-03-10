---
title: Operator Approvals
description: How to approve another address to act on your confidential tokens.
---

# Operator Approvals

Operator approval lets another address (a DEX contract, multisig, or automated service) transfer confidential tokens on your behalf. This is the FHE equivalent of ERC-20's `approve` / `transferFrom` pattern.

## Steps

### 1. Approve an operator

Call `approve` on a token instance. By default, the approval is valid for 1 hour:

```ts
const token = sdk.createToken("0xEncryptedERC20");

// Approve with the default 1-hour duration
await token.approve("0xSpender");
```

The SDK sends a single on-chain transaction. The spender can call `confidentialTransferFrom` until the approval expires.

### 2. Approve with a custom expiry

Pass a Unix timestamp (in seconds) as the second argument to set a longer or shorter approval window:

```ts
// Approve until a specific timestamp (e.g. 24 hours from now)
const expiry = Math.floor(Date.now() / 1000) + 86400;
await token.approve("0xSpender", expiry);
```

### 3. Check approval status

Query whether a spender is currently approved:

```ts
const approved = await token.isApproved("0xSpender");
// returns true if the approval is active and has not expired
```

You can also check for a specific owner (not yourself):

```ts
const approved = await token.isApproved("0xSpender", "0xOwner");
```

### 4. Use operator transfer

Once approved, the operator can transfer tokens from the owner's confidential balance:

```ts
// As the approved operator
const token = sdk.createToken("0xEncryptedERC20");

await token.confidentialTransferFrom("0xFrom", "0xTo", 500n);
```

The amount is encrypted before submission, just like a regular `confidentialTransfer`. On-chain observers see the transaction but not the value.

### 5. React: use the approval hooks

The React SDK provides hooks that wrap these operations with loading states and error handling:

```tsx
"use client";

import {
  useConfidentialApprove,
  useConfidentialIsApproved,
  useConfidentialTransferFrom,
} from "@zama-fhe/react-sdk";

function ApprovalPanel({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { mutateAsync: approve, isPending: isApproving } = useConfidentialApprove({ tokenAddress });

  const { data: isApproved } = useConfidentialIsApproved({ tokenAddress, spender: "0xSpender" });

  const { mutateAsync: transferFrom, isPending: isTransferring } = useConfidentialTransferFrom({
    tokenAddress,
  });

  return (
    <div>
      <p>Approved: {isApproved ? "Yes" : "No"}</p>
      <button onClick={() => approve({ spender: "0xSpender" })} disabled={isApproving}>
        Approve Operator
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

Operator approval also applies to the unshield (unwrap + finalize) flow. If an operator needs to unshield tokens on the owner's behalf, the owner must approve the operator separately for this action. The approval mechanism is the same -- `token.approve("0xOperator")` -- and the operator can then call `unshield` or `unshieldAll` on the owner's tokens.

This is a distinct concern from transfer approval: approving an operator for transfers does not automatically allow them to unshield.

## Next steps

- [Token.approve](/reference/sdk/Token) -- full method signature and options
- [useConfidentialApprove](/reference/react/useConfidentialApprove) -- React hook reference
- [useConfidentialIsApproved](/reference/react/useConfidentialIsApproved) -- query hook reference
- [useConfidentialTransferFrom](/reference/react/useConfidentialTransferFrom) -- operator transfer hook reference
