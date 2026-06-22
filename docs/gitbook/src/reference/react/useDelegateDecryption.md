---
title: useDelegateDecryption
description: Mutation hook that grants FHE decryption rights for a token to another address.
---

# useDelegateDecryption

Mutation hook that grants FHE decryption rights for a token to another address via the on-chain ACL. Automatically invalidates [`useDelegationStatus`](./useDelegationStatus.md) queries on success.

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
  const { mutateAsync: delegate, isPending, error } = useDelegateDecryption(tokenAddress);

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

### address

`Address`

Address of the confidential token contract. Passed positionally as the first argument.

```ts
const { mutateAsync: delegate } = useDelegateDecryption("0xToken");
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

## Return Type

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useRevokeDelegation`](./useRevokeDelegation.md) -- revoke a previously granted delegation
- [`useDelegationStatus`](./useDelegationStatus.md) -- check whether a delegation is active
- [`useDecryptBalanceAs`](./useDecryptBalanceAs.md) -- decrypt a balance as the delegate
- [Delegated Decryption](../sdk/delegation.md) -- SDK reference
