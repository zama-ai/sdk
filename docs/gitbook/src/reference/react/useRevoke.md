---
title: useRevoke
description: Revoke the session signature for specific token addresses.
---

# useRevoke

Revoke the session signature for specific token addresses. Stored credentials remain intact — the next decrypt requires a fresh wallet signature.

## Import

```ts
import { useRevoke } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="RevokeButton.tsx" %}

```tsx
import { useRevoke } from "@zama-fhe/react-sdk";

function RevokeButton({ tokens }: { tokens: Address[] }) {
  const { mutate: revoke, isPending, isSuccess } = useRevoke();

  return (
    <button onClick={() => revoke(tokens)} disabled={isPending}>
      {isPending ? "Revoking..." : "Revoke tokens"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

`useRevoke` takes no constructor parameters.

## Mutation Variables

### addresses

`Address[]`

Array of token addresses to revoke session signatures for.

```ts
const { mutate: revoke } = useRevoke();

revoke(["0xTokenA", "0xTokenB"]);
```

## Return Type

{% include ".gitbook/includes/mutation-result.md" %}

## Behavior

- Clears the cached session signature for each token in the array.
- Auto-invalidates all [`useIsAllowed`](/reference/react/useIsAllowed) queries on success.
- Does **not** delete stored FHE credentials — only the session-level signature is cleared.

{% hint style="info" %}
If you use [`WagmiSigner`](/reference/sdk/WagmiSigner), the SDK auto-revokes on wallet disconnect or account change. Manual revoke is for [`ViemSigner`](/reference/sdk/ViemSigner) and [`EthersSigner`](/reference/sdk/EthersSigner) users.
{% endhint %}

## Related

- [`useRevokeSession`](/reference/react/useRevokeSession) — revoke the entire session instead of specific tokens
- [`useAllow`](/reference/react/useAllow) — pre-authorize tokens with a single wallet signature
- [`useIsAllowed`](/reference/react/useIsAllowed) — check whether a session signature is valid
- [`Token.revoke()`](/reference/sdk/Token#revoke) — imperative equivalent on the SDK class
