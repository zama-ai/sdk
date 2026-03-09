---
title: useIsAllowed
description: Query hook that checks whether a session signature is cached and valid for a token.
---

# useIsAllowed

Query hook that checks whether a session signature is cached and valid for a given token.

Returns `true` if decrypt operations can proceed without a wallet prompt. Returns `false` once the `sessionTTL` has expired (default: 30 days).

## Import

```ts
import { useIsAllowed } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [AuthGuard.tsx]
import { useIsAllowed, useAllow } from "@zama-fhe/react-sdk";

function AuthGuard({ tokenAddress }: { tokenAddress: Address }) {
  const { data: allowed, isLoading } = useIsAllowed(tokenAddress); // [!code focus]
  const { mutateAsync: allow } = useAllow();

  if (isLoading) return <span>Checking session...</span>;

  if (!allowed) {
    return <button onClick={() => allow([tokenAddress])}>Authorize wallet</button>;
  }

  return <span>Session active</span>;
}
```

:::

## Parameters

```ts
import { type UseIsAllowedParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential token wrapper contract to check.

```tsx
const { data: allowed } = useIsAllowed("0xToken"); // [!code focus]
```

## Return Type

```ts
import { type UseIsAllowedReturnType } from "@zama-fhe/react-sdk";
```

`data` is a `boolean`:

- `true` -- a valid session signature is cached; decrypts will not prompt the wallet.
- `false` -- no cached signature, or the `sessionTTL` has expired. Call [`useAllow`](/reference/react/useAllow) to re-authorize.

<!--@include: @/shared/query-result.md-->

## Related

- [`useAllow`](/reference/react/useAllow) -- pre-authorize tokens with one wallet signature
- [`useRevoke`](/reference/react/query-keys#userevoke) -- revoke session credentials
- [Session management](/guides/configuration#session-management) -- security model and TTL configuration
