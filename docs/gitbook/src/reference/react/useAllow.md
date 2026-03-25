---
title: useAllow
description: Mutation hook that signs an EIP-712 message authorizing decryption of confidential handles for any contract.
---

# useAllow

Mutation hook that signs an EIP-712 message authorizing decryption of confidential handles for a list of contract addresses. This is **not token-specific** — any contract that uses FHE-encrypted values (confidential tokens, DeFi vaults, games, etc.) can be authorized in a single wallet signature.

Call this early (e.g. after wallet connect) so that subsequent decrypt operations do not trigger individual wallet popups. Automatically invalidates [`useIsAllowed`](/reference/react/useIsAllowed) queries on success.

## Import

```ts
import { useAllow } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="AllowButton.tsx" %}

```tsx
import { useAllow } from "@zama-fhe/react-sdk";

function AllowButton({ contracts }: { contracts: `0x${string}`[] }) {
  const { mutateAsync: allow, isPending } = useAllow();

  const handleAllow = async () => {
    await allow(contracts);
    // All subsequent decrypt operations reuse the cached credential
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
import { useAllow } from "@zama-fhe/react-sdk";
import { useEffect } from "react";

function AuthOnConnect({ contracts }: { contracts: `0x${string}`[] }) {
  const { mutateAsync: allow } = useAllow();

  useEffect(() => {
    // Pre-authorize on wallet connect
    allow(contracts);
  }, []);

  return null;
}
```

{% endtab %}
{% endtabs %}

## Parameters

`useAllow` takes no configuration parameters.

## Mutation Variables

### addresses

`Address[]`

Array of contract addresses to authorize decryption for in a single wallet signature. These can be any contracts that use FHE-encrypted values — not limited to tokens.

```tsx
await allow(["0xContractA", "0xContractB", "0xContractC"]);
```

## Return Type

Returns a standard TanStack Query `UseMutationResult<void, Error, Address[]>`.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useIsAllowed`](/reference/react/useIsAllowed) -- check whether a session signature is cached
- [`useRevoke`](/reference/react/useRevoke) -- revoke decrypt authorization for specific contracts
- [`useRevokeSession`](/reference/react/useRevokeSession) -- revoke the entire session
- [Session Model](/concepts/session-model) -- security model and TTL configuration
