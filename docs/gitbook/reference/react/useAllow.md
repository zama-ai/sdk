---
title: useAllow
description: Mutation hook that pre-authorizes an FHE keypair for multiple tokens with one wallet signature.
---

# useAllow

Mutation hook that pre-authorizes an FHE keypair for multiple tokens with one wallet signature.

Call this early (e.g. after wallet connect) so that subsequent balance decrypts do not trigger individual wallet popups. Automatically invalidates [`useIsAllowed`](/reference/react/useIsAllowed) queries on success.

## Import

```ts
import { useAllow } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [AllowButton.tsx]
import { useAllow } from "@zama-fhe/react-sdk";

function AllowButton({ tokens }: { tokens: Address[] }) {
  const { mutateAsync: allow, isPending } = useAllow();

  const handleAllow = async () => {
    await allow(tokens); // [!code focus]
    // All subsequent balance reads reuse the cached credential
  };

  return (
    <button onClick={handleAllow} disabled={isPending}>
      {isPending ? "Signing..." : "Authorize tokens"}
    </button>
  );
}
```

```tsx [OnConnect.tsx]
import { useAllow } from "@zama-fhe/react-sdk";
import { useEffect } from "react";

function AuthOnConnect({ tokens }: { tokens: Address[] }) {
  const { mutateAsync: allow } = useAllow();

  useEffect(() => {
    // Pre-authorize on wallet connect
    allow(tokens); // [!code focus]
  }, []);

  return null;
}
```

:::

## Parameters

`useAllow` takes no configuration parameters.

## Mutation Variables

### addresses

`Address[]`

Array of confidential token wrapper addresses to authorize in a single wallet signature.

```tsx
await allow(["0xTokenA", "0xTokenB", "0xTokenC"]); // [!code focus]
```

## Return Type

```ts
import { type UseAllowReturnType } from "@zama-fhe/react-sdk";
```

<!--@include: @/shared/mutation-result.md-->

## Related

- [`useIsAllowed`](/reference/react/useIsAllowed) -- check whether a session signature is cached
- [`useRevoke`](/reference/react/query-keys#userevoke) -- revoke session credentials for specific tokens
- [`useRevokeSession`](/reference/react/query-keys#userevokesession) -- revoke the entire session
- [Session management](/guides/configuration#session-management) -- security model and TTL configuration
