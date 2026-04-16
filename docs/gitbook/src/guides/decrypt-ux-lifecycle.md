---
title: Decrypt UX lifecycle
description: How to avoid blind-sign wallet popups by gating confidential balance queries behind an explicit user action.
---

# Decrypt UX lifecycle

Confidential balance queries trigger an EIP-712 wallet signature the first time they run -- the SDK needs FHE decrypt credentials. If your app calls `useConfidentialBalance` on render without gating, users see an unsolicited MetaMask popup before they have taken any action. In crypto UX this is a **blind-signing anti-pattern**: users are trained to reject unexpected signature requests, and security tools like Blockaid may flag them.

This guide shows the recommended pattern: check cached credentials first, show a locked state, and let the user decide when to sign.

## The pattern

```text
Page loads
  |
  v
useIsAllowed({ contractAddresses })
  |
  +-- true (credentials cached from a prior session)
  |     |
  |     v
  |   useConfidentialBalance({ tokenAddress }, { enabled: true })
  |     --> balance decrypts silently, no wallet popup
  |
  +-- false (no cached credentials)
        |
        v
      Show "locked" / "encrypted" UI
        |
        v
      User clicks "Decrypt Balance" button
        |
        v
      useAllow() --> EIP-712 wallet signature
        |
        v
      isAllowed becomes true, balance query enables, balance appears
```

## Complete example

{% code title="ConfidentialBalanceCard.tsx" %}

```tsx
import { useAllow, useIsAllowed, useConfidentialBalance } from "@zama-fhe/react-sdk";
import { formatUnits, type Address } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function ConfidentialBalanceCard({
  tokenAddress,
  decimals,
  symbol,
}: {
  tokenAddress: Address | undefined;
  decimals: number;
  symbol: string;
}) {
  // 1. Check if credentials are already cached for this token
  const { data: isAllowed } = useIsAllowed({
    contractAddresses: tokenAddress ? [tokenAddress] : [],
    query: { enabled: Boolean(tokenAddress) },
  });

  // 2. Gate the balance query -- only runs when isAllowed is true
  const balance = useConfidentialBalance(
    { tokenAddress: tokenAddress ?? ZERO_ADDRESS },
    { enabled: !!tokenAddress && !!isAllowed },
  );

  // 3. useAllow triggers the EIP-712 signature on demand
  const { mutate: allow, isPending: isSigning } = useAllow();

  // -- Render --

  // No token selected yet
  if (!tokenAddress) return null;

  // Credentials not cached: show locked state with explicit action
  if (!isAllowed) {
    return (
      <div>
        <p>{symbol} balance: *****</p>
        <button onClick={() => allow([tokenAddress])} disabled={isSigning}>
          {isSigning ? "Signing..." : "Decrypt Balance"}
        </button>
      </div>
    );
  }

  // Credentials cached: balance is decrypting or ready
  return (
    <div>
      <p>
        {symbol} balance:{" "}
        {balance.isLoading
          ? "Decrypting..."
          : balance.data !== undefined
            ? formatUnits(balance.data, decimals)
            : "---"}
      </p>
    </div>
  );
}
```

{% endcode %}

## Key points

### Why `useIsAllowed` before `useConfidentialBalance`

`useConfidentialBalance` internally creates FHE decrypt credentials if none exist. That creation requires an EIP-712 wallet signature. By checking `useIsAllowed` first and passing `{ enabled: !!isAllowed }`, you prevent the balance query from running -- and therefore prevent the wallet popup -- until the user explicitly opts in.

### Batch authorization for multiple tokens

If your app shows several token balances, authorize them all with a single signature:

```tsx
const allTokenAddresses = tokens.map((t) => t.confidentialTokenAddress);

const { data: isAllowed } = useIsAllowed({
  contractAddresses: allTokenAddresses,
});

const { mutate: allow } = useAllow();

// One button, one signature, all tokens
<button onClick={() => allow(allTokenAddresses)}>Decrypt All Balances</button>;
```

After signing, every `useConfidentialBalance` gated on `isAllowed` enables automatically.

### Returning users skip the prompt

Credentials are persisted in your storage backend (IndexedDB by default). When a user returns to your app, `useIsAllowed` returns `true` immediately and balances decrypt silently -- no popup, no friction. The credentials remain valid for `sessionTTL` (default: 30 days).

### What about `useUserDecrypt`?

The same pattern applies to any decrypt operation. Gate `useUserDecrypt` with `{ enabled: !!isAllowed }` and trigger `useAllow` from an explicit action:

```tsx
const { data: isAllowed } = useIsAllowed({ contractAddresses: [contractAddress] });
const { data } = useUserDecrypt(
  { handles: [{ handle, contractAddress }] },
  { enabled: !!isAllowed },
);
```

See the [Encrypt & decrypt](encrypt-decrypt.md) guide for a full example.

## Anti-pattern: signature on render

Do **not** call `useConfidentialBalance` without gating on `isAllowed`:

```tsx
// BAD -- triggers wallet popup as soon as the component mounts
function BadExample({ tokenAddress }: { tokenAddress: Address }) {
  const balance = useConfidentialBalance({ tokenAddress });
  return <p>{balance.data?.toString()}</p>;
}
```

This causes:

- An unexpected MetaMask popup before the user has taken any action
- Users rejecting the signature out of suspicion
- Transaction-security tools flagging the request
- Loss of user trust in your application

## Next steps

- [Check balances](check-balances.md) -- caching, batch queries, and raw handles
- [`useIsAllowed` reference](/reference/react/useIsAllowed) -- full API and parameters
- [`useAllow` reference](/reference/react/useAllow) -- pre-authorize contracts
- [Handle errors](handle-errors.md) -- recovering from `SigningRejectedError`
