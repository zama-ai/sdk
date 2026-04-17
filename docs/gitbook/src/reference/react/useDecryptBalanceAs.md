---
title: useDecryptBalanceAs
description: Mutation hook that decrypts another user's confidential balance as a delegate.
---

# useDecryptBalanceAs

Mutation hook that decrypts a delegator's confidential balance. The connected wallet must have been granted delegation rights via the on-chain ACL.

## Import

```ts
import { useDecryptBalanceAs } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useDecryptBalanceAs } from "@zama-fhe/react-sdk";

function DelegatedBalance({
  tokenAddress,
  delegatorAddress,
}: {
  tokenAddress: `0x${string}`;
  delegatorAddress: `0x${string}`;
}) {
  const { mutateAsync: decryptAs, data: balance, isPending } = useDecryptBalanceAs(tokenAddress);

  async function handleDecrypt() {
    await decryptAs({ delegatorAddress });
  }

  return (
    <div>
      <button onClick={handleDecrypt} disabled={isPending}>
        {isPending ? "Decrypting..." : "Decrypt balance"}
      </button>
      {balance !== undefined && <span>Balance: {balance.toString()}</span>}
    </div>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### tokenAddress

`Address`

Address of the confidential token contract. Passed as the first argument to `useDecryptBalanceAs`.

```ts
const { mutateAsync: decryptAs } = useDecryptBalanceAs("0xToken");
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

```ts
import { type DecryptBalanceAsParams } from "@zama-fhe/sdk/query";
```

### delegatorAddress

`Address`

The address that delegated decryption rights.

### balanceHolder

`Address | undefined`

The address whose on-chain balance to read. Defaults to `delegatorAddress`. Use this when the balance holder differs from the delegator.

```ts
await decryptAs({
  delegatorAddress: "0xDelegator",
  balanceHolder: "0xBalanceHolder",
});
```

## Return Type

`data` resolves to `bigint` — the decrypted token balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useBatchDecryptBalancesAs`](/reference/react/useBatchDecryptBalancesAs) -- batch variant for multiple tokens
- [`useDelegationStatus`](/reference/react/useDelegationStatus) -- check delegation status before decrypting
- [`useConfidentialBalance`](/reference/react/useConfidentialBalance) -- decrypt your own balance (non-delegated)
- [Delegated Decryption](/reference/sdk/delegation) -- SDK reference
