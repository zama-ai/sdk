---
title: useRevokeDelegation
description: Mutation hook that revokes FHE decryption delegation for a token.
---

# useRevokeDelegation

Mutation hook that revokes a previously granted FHE decryption delegation for a token. Automatically invalidates [`useDelegationStatus`](/reference/react/useDelegationStatus) queries on success.

## Import

```ts
import { useRevokeDelegation } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useRevokeDelegation } from "@zama-fhe/react-sdk";

function RevokeButton({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { mutateAsync: revoke, isPending } = useRevokeDelegation({ tokenAddress });

  async function handleRevoke() {
    const { txHash } = await revoke({ delegateAddress: "0xDelegate" });
    console.log("Revoked in", txHash);
  }

  return (
    <button onClick={handleRevoke} disabled={isPending}>
      {isPending ? "Revoking..." : "Revoke"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseZamaConfig } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential ERC-20 token contract.

```ts
const { mutateAsync: revoke } = useRevokeDelegation({
  tokenAddress: "0xToken",
});
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

### delegateAddress

`Address`

The address to revoke decryption rights from.

```ts
await revoke({ delegateAddress: "0xDelegate" });
```

## Return Type

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useDelegateDecryption`](/reference/react/useDelegateDecryption) -- grant delegation
- [`useDelegationStatus`](/reference/react/useDelegationStatus) -- check whether a delegation is active
- [Delegated Decryption](/reference/sdk/delegation) -- SDK reference
