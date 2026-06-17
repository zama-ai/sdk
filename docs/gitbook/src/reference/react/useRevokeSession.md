---
title: useRevokeSession
description: Revoke the entire session for the connected wallet.
---

# useRevokeSession

Revoke the entire session for the connected wallet. Unlike [`useRevoke`](./useRevoke.md) which targets specific contract addresses, this clears the session-level signature.

## Import

```ts
import { useRevokeSession } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="DisconnectPanel.tsx" %}

```tsx
import { useRevokeSession } from "@zama-fhe/react-sdk";

function DisconnectPanel() {
  const { mutate: revokeSession, isPending } = useRevokeSession();

  return (
    <button onClick={() => revokeSession()} disabled={isPending}>
      {isPending ? "Revoking session..." : "Revoke session"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

`useRevokeSession` takes no constructor parameters.

## Mutation variables

No mutation variables. Call `mutate()` or `mutateAsync()` with no arguments.

```ts
const { mutate: revokeSession } = useRevokeSession();

revokeSession();
```

## Return Type

{% include ".gitbook/includes/mutation-result.md" %}

## Behavior

- Clears the session-level signature for the connected wallet.
- Auto-invalidates all [`useIsAllowed`](./useIsAllowed.md) queries on success.
- After revoking, any balance decrypt or FHE operation will prompt a new wallet signature.

{% hint style="info" %}
If you use [`WagmiSigner`](../sdk/WagmiSigner.md), the SDK auto-revokes on wallet disconnect or account change — you do not need to call this hook manually for that case.
{% endhint %}

## Related

- [`useRevoke`](./useRevoke.md) — revoke specific contract addresses instead of the full session
- [`useAllow`](./useAllow.md) — pre-authorize contracts with a single wallet signature
- [`useIsAllowed`](./useIsAllowed.md) — check whether a session signature is valid
