---
title: useRevokeSession
description: Revoke the entire session for the connected wallet.
---

# useRevokeSession

Revoke the entire session for the connected wallet. Unlike [`useRevoke`](/reference/react/useRevoke) which targets specific tokens, this clears the session-level signature.

## Import

```ts
import { useRevokeSession } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [DisconnectPanel.tsx]
import { useRevokeSession } from "@zama-fhe/react-sdk";

function DisconnectPanel() {
  const { mutate: revokeSession, isPending } = useRevokeSession(); // [!code focus]

  return (
    <button
      onClick={() => revokeSession()} // [!code focus]
      disabled={isPending}
    >
      {isPending ? "Revoking session..." : "Revoke session"}
    </button>
  );
}
```

:::

## Parameters

`useRevokeSession` takes no constructor parameters.

## Mutation Variables

No mutation variables. Call `mutate()` or `mutateAsync()` with no arguments.

```ts
const { mutate: revokeSession } = useRevokeSession();

revokeSession(); // [!code focus]
```

## Return Type

<!--@include: @/shared/mutation-result.md-->

## Behavior

- Clears the session-level signature for the connected wallet.
- Auto-invalidates all [`useIsAllowed`](/reference/react/useIsAllowed) queries on success.
- After revoking, any balance decrypt or FHE operation will prompt a new wallet signature.

::: tip
If you use [`WagmiSigner`](/reference/sdk/WagmiSigner), the SDK auto-revokes on wallet disconnect or account change — you do not need to call this hook manually for that case.
:::

## Related

- [`useRevoke`](/reference/react/useRevoke) — revoke specific token addresses instead of the full session
- [`useAllow`](/reference/react/query-keys#useallow) — pre-authorize tokens with a single wallet signature
- [`useIsAllowed`](/reference/react/query-keys#useisallowed) — check whether a session signature is valid
