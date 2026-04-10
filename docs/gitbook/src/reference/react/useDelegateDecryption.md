---
title: useDelegateDecryption
description: Mutation hook that grants FHE decryption rights for a token to another address.
---

# useDelegateDecryption

Mutation hook that grants FHE decryption rights for a token to another address via the on-chain ACL. Automatically invalidates [`useDelegationStatus`](/reference/react/useDelegationStatus) queries on success.

## Import

```ts
import { useDelegateDecryption } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useDelegateDecryption } from "@zama-fhe/react-sdk";

function DelegateButton({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { mutateAsync: delegate, isPending, error } = useDelegateDecryption({ tokenAddress });

  async function handleDelegate() {
    const { txHash } = await delegate({
      delegateAddress: "0xDelegate",
      expirationDate: new Date("2025-12-31"),
    });
    console.log("Delegated in", txHash);
  }

  return (
    <button onClick={handleDelegate} disabled={isPending}>
      {isPending ? "Delegating..." : "Delegate"}
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
const { mutateAsync: delegate } = useDelegateDecryption({
  tokenAddress: "0xToken",
});
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

### delegateAddress

`Address`

The address to grant decryption rights to.

### expirationDate

`Date | undefined`

When the delegation expires. If omitted, the delegation is permanent.

```ts
await delegate({
  delegateAddress: "0xDelegate",
  expirationDate: new Date("2025-12-31"),
});
```

## Return type

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useRevokeDelegation`](/reference/react/useRevokeDelegation) -- revoke a previously granted delegation
- [`useDelegationStatus`](/reference/react/useDelegationStatus) -- check whether a delegation is active
- [`useDecryptBalanceAs`](/reference/react/useDecryptBalanceAs) -- decrypt a balance as the delegate
- [Delegated Decryption](/reference/sdk/delegation) -- SDK reference
