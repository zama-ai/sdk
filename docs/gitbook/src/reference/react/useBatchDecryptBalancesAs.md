---
title: useBatchDecryptBalancesAs
description: Mutation hook that decrypts confidential balances across multiple tokens as a delegate.
---

# useBatchDecryptBalancesAs

Mutation hook that decrypts a delegator's confidential balances across multiple tokens in a single call. Uses `ReadonlyToken.batchDecryptBalancesAs` under the hood with caching, concurrency control, and per-token error handling.

## Import

```ts
import { useBatchDecryptBalancesAs } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useBatchDecryptBalancesAs } from "@zama-fhe/react-sdk";
import { useReadonlyToken } from "@zama-fhe/react-sdk";

function PortfolioBalance({
  tokenAddresses,
  delegatorAddress,
}: {
  tokenAddresses: `0x${string}`[];
  delegatorAddress: `0x${string}`;
}) {
  // Build ReadonlyToken instances (typically from useReadonlyToken or sdk.createReadonlyToken)
  const tokens = tokenAddresses.map((addr) => useReadonlyToken(addr));

  const {
    mutateAsync: batchDecryptAs,
    data: balances,
    isPending,
  } = useBatchDecryptBalancesAs(tokens);

  async function handleDecrypt() {
    await batchDecryptAs({ delegatorAddress });
  }

  return (
    <div>
      <button onClick={handleDecrypt} disabled={isPending}>
        {isPending ? "Decrypting..." : "Decrypt all"}
      </button>
      {balances &&
        Array.from(balances).map(([address, balance]) => (
          <div key={address}>
            {address}: {balance.toString()}
          </div>
        ))}
    </div>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### tokens

`ReadonlyToken[]`

Array of `ReadonlyToken` instances to decrypt balances for. Passed as the first argument to `useBatchDecryptBalancesAs`.

```ts
const { mutateAsync: batchDecryptAs } = useBatchDecryptBalancesAs(tokens);
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation Variables

Passed to `mutate` / `mutateAsync` at call time.

```ts
import { type BatchDecryptAsOptions } from "@zama-fhe/sdk";
```

### delegatorAddress

`Address`

The address that delegated decryption rights.

### handles

`Handle[] | undefined`

Pre-fetched encrypted handles. When omitted, handles are fetched from the chain.

### owner

`Address | undefined`

Balance owner address. Defaults to `delegatorAddress`.

### maxConcurrency

`number | undefined`

Maximum number of concurrent decrypt calls. Default: `Infinity`.

### onError

`(error: Error, address: Address) => bigint | undefined`

Called when decryption fails for a single token. Return a fallback value.

```ts
await batchDecryptAs({
  delegatorAddress: "0xDelegator",
  maxConcurrency: 3,
  onError: (err, addr) => {
    console.error(addr, err);
    return 0n;
  },
});
```

## Return Type

`data` resolves to `Map<Address, bigint>` — a map from each token address to its decrypted balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useDecryptBalanceAs`](/reference/react/useDecryptBalanceAs) -- single-token variant
- [`useDelegationStatus`](/reference/react/useDelegationStatus) -- check delegation status before decrypting
- [Delegated Decryption](/reference/sdk/delegation) -- SDK reference
