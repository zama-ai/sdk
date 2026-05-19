---
title: useRevokePermits
description: Revoke FHE permits for specific contract addresses, or all permits at once.
---

# useRevokePermits

Revoke FHE permits for the current signer. With a contract list, removes direct-decrypt permits on the current chain. Without arguments, removes every permit across all chains and delegators. The keypair survives — use [`useClearCredentials`](/reference/react/useClearCredentials) to also wipe the keypair.

## Import

```ts
import { useRevokePermits } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="RevokeButton.tsx" %}

```tsx
import { useRevokePermits } from "@zama-fhe/react-sdk";

function RevokeButton({ contracts }: { contracts: `0x${string}`[] }) {
  const { mutate: revokePermits, isPending, isSuccess } = useRevokePermits();

  return (
    <button onClick={() => revokePermits(contracts)} disabled={isPending}>
      {isPending ? "Revoking..." : "Revoke permits"}
    </button>
  );
}
```

{% endtab %}
{% tab title="RevokeAll.tsx" %}

```tsx
import { useRevokePermits } from "@zama-fhe/react-sdk";

function RevokeAllButton() {
  const { mutate: revokePermits, isPending } = useRevokePermits();

  return (
    <button onClick={() => revokePermits()} disabled={isPending}>
      {isPending ? "Revoking all..." : "Revoke all permits"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

`useRevokePermits` takes no constructor parameters.

## Mutation variables

### addresses

`Address[] | void`

Optional array of contract addresses. When provided, revokes permits on the current chain whose payload touches any listed address. When omitted, revokes all permits across all chains and delegators.

```ts
const { mutate: revokePermits } = useRevokePermits();

revokePermits(["0xContractA", "0xContractB"]); // current chain only
revokePermits(); // all permits, all chains
```

## Return Type

{% include ".gitbook/includes/mutation-result.md" %}

## Behavior

- Removes signed permits from the permission store.
- Auto-invalidates all [`useHasPermit`](/reference/react/useHasPermit) queries on success.
- The FHE keypair is not affected — only permits are removed.

## Related

- [`useClearCredentials`](/reference/react/useClearCredentials) — wipe the keypair and all permits
- [`useGrantPermit`](/reference/react/useGrantPermit) — sign permits for contracts
- [`useHasPermit`](/reference/react/useHasPermit) — check whether stored permits cover contracts
