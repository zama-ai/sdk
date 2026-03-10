---
title: useIsAllowed
description: Query hook that checks whether a session signature is cached and valid for a token.
---

# useIsAllowed

Query hook that checks whether a session signature is cached and valid.

Returns `true` if decrypt operations can proceed without a wallet prompt. Returns `false` once the `sessionTTL` has expired (default: 30 days).

## Import

```ts
import { useIsAllowed } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="AuthGuard.tsx" %}

```tsx
import { useIsAllowed, useAllow } from "@zama-fhe/react-sdk";

function AuthGuard({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { data: allowed, isLoading } = useIsAllowed();
  const { mutateAsync: allow } = useAllow();

  if (isLoading) return <span>Checking session...</span>;

  if (!allowed) {
    return <button onClick={() => allow([tokenAddress])}>Authorize wallet</button>;
  }

  return <span>Session active</span>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

`useIsAllowed` takes no parameters. The session state applies globally to the SDK instance (not per-token).

```tsx
const { data: allowed } = useIsAllowed();
```

## Return Type

```ts
// Returns UseQueryResult<boolean, Error>
```

`data` is a `boolean`:

- `true` -- a valid session signature is cached; decrypts will not prompt the wallet.
- `false` -- no cached signature, or the `sessionTTL` has expired. Call [`useAllow`](/reference/react/useAllow) to re-authorize.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [`useAllow`](/reference/react/useAllow) -- pre-authorize tokens with one wallet signature
- [`useRevoke`](/reference/react/useRevoke) -- revoke session credentials
- [Session Model](/concepts/session-model) -- security model and TTL configuration
