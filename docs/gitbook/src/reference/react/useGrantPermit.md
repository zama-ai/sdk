---
title: useGrantPermit
description: Mutation hook that signs an EIP-712 message authorizing decryption of confidential encrypted values for any contract.
---

# useGrantPermit

Mutation hook that signs an EIP-712 message authorizing decryption of confidential encrypted values for a list of contract addresses. This is **not token-specific** — any contract that uses FHE-encrypted values (confidential tokens, DeFi vaults, games, etc.) can be authorized in a single wallet signature.

Call this early (e.g. after wallet connect) so that [`useDecryptValues`](/reference/react/useDecryptValues) queries fire automatically without wallet popups. Automatically invalidates [`useHasPermit`](/reference/react/useHasPermit) queries on success.

{% hint style="warning" %}
**Include all contracts you plan to decrypt.** `useDecryptValues` checks that stored permits cover every contract address in its `inputs` before firing the query. If any contract is missing, the query stays disabled.
{% endhint %}

## Import

```ts
import { useGrantPermit } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="AllowButton.tsx" %}

```tsx
import { useGrantPermit } from "@zama-fhe/react-sdk";

function AllowButton({ contracts }: { contracts: `0x${string}`[] }) {
  const { mutateAsync: grantPermit, isPending } = useGrantPermit();

  const handleAllow = async () => {
    await grantPermit(contracts);
    // All subsequent decrypt operations reuse the cached permits
  };

  return (
    <button onClick={handleAllow} disabled={isPending}>
      {isPending ? "Signing..." : "Authorize contracts"}
    </button>
  );
}
```

{% endtab %}
{% tab title="OnConnect.tsx" %}

```tsx
import { useGrantPermit } from "@zama-fhe/react-sdk";
import { useEffect } from "react";

function AuthOnConnect({ contracts }: { contracts: `0x${string}`[] }) {
  const { mutateAsync: grantPermit } = useGrantPermit();

  useEffect(() => {
    // Pre-authorize on wallet connect
    grantPermit(contracts);
  }, []);

  return null;
}
```

{% endtab %}
{% endtabs %}

## Parameters

`useGrantPermit` takes no configuration parameters.

## Mutation variables

### addresses

`Address[]`

Array of contract addresses to authorize decryption for in a single wallet signature. These can be any contracts that use FHE-encrypted values — not limited to tokens.

```tsx
// Authorize any contracts with encrypted state — tokens, auctions, governance, etc.
await grantPermit([confidentialTokenAddress, auctionAddress, governanceAddress]);
```

## Return Type

Returns a standard TanStack Query `UseMutationResult<void, Error, Address[]>`.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useHasPermit`](/reference/react/useHasPermit) -- check whether stored permits cover contracts
- [`useRevokePermits`](/reference/react/useRevokePermits) -- revoke permits for specific contracts
- [`useClearCredentials`](/reference/react/useClearCredentials) -- wipe the transport key pair and all permits
- [Permit Model](/concepts/permit-model) -- permit lifecycle and TTL configuration
