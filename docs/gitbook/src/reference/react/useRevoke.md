---
title: useRevoke
description: Revoke the EIP-712 decrypt authorization for specific contract addresses.
---

# useRevoke

Revoke the EIP-712 decrypt authorization for specific contract addresses. This is **not token-specific** — it works for any contract that uses FHE-encrypted values. Stored credentials remain intact — the next decrypt requires a fresh wallet signature.

## Import

```ts
import { useRevoke } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="RevokeButton.tsx" %}

```tsx
import { useRevoke } from "@zama-fhe/react-sdk";

function RevokeButton({ contracts }: { contracts: `0x${string}`[] }) {
  const { mutate: revoke, isPending, isSuccess } = useRevoke();

  return (
    <button onClick={() => revoke(contracts)} disabled={isPending}>
      {isPending ? "Revoking..." : "Revoke authorization"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

`useRevoke` takes no constructor parameters.

## Mutation variables

### addresses

`Address[]`

Array of contract addresses to revoke decrypt authorization for. These can be any contracts that use FHE-encrypted values — not limited to tokens.

```ts
const { mutate: revoke } = useRevoke();

revoke(["0xContractA", "0xContractB"]);
```

## Return Type

{% include ".gitbook/includes/mutation-result.md" %}

## Behavior

- Clears the cached session signature for each contract in the array.
- Auto-invalidates all [`useIsAllowed`](/reference/react/useIsAllowed) queries on success.
- Does **not** delete stored FHE credentials — only the session-level signature is cleared.

{% hint style="info" %}
If you use [`WagmiSigner`](/reference/sdk/WagmiSigner), the SDK auto-revokes on wallet disconnect or account change. Manual revoke is for [`ViemSigner`](/reference/sdk/ViemSigner) and [`EthersSigner`](/reference/sdk/EthersSigner) users.
{% endhint %}

## Related

- [`useRevokeSession`](/reference/react/useRevokeSession) — revoke the entire session instead of specific contracts
- [`useAllow`](/reference/react/useAllow) — authorize decryption for contracts with a single wallet signature
- [`useIsAllowed`](/reference/react/useIsAllowed) — check whether a session signature is valid
- [`Token.revoke()`](/reference/sdk/Token#revoke) — imperative equivalent on the SDK class
