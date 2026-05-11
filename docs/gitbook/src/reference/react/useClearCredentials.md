---
title: useClearCredentials
description: Wipe the FHE keypair and all permits for the connected wallet.
---

# useClearCredentials

Wipe the keypair for the current signer and cascade-delete every permit (across chains and delegators) referencing it. Use this for "log out" handlers that should leave no trace.

## Import

```ts
import { useClearCredentials } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="LogoutPanel.tsx" %}

```tsx
import { useClearCredentials } from "@zama-fhe/react-sdk";

function LogoutPanel() {
  const { mutate: clearCredentials, isPending } = useClearCredentials();

  return (
    <button onClick={() => clearCredentials()} disabled={isPending}>
      {isPending ? "Clearing..." : "Clear all credentials"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

`useClearCredentials` takes no constructor parameters.

## Mutation variables

No mutation variables. Call `mutate()` or `mutateAsync()` with no arguments.

```ts
const { mutate: clearCredentials } = useClearCredentials();

clearCredentials();
```

## Return Type

{% include ".gitbook/includes/mutation-result.md" %}

## Behavior

- Wipes the FHE keypair for the connected wallet.
- Cascade-deletes every permit across all chains and delegators.
- Auto-invalidates all [`useIsAllowed`](/reference/react/useIsAllowed) queries on success.
- After clearing, any decrypt operation will generate a fresh keypair and prompt for new permits.

{% hint style="info" %}
The SDK auto-clears credentials on wallet disconnect or account change when the signer adapter implements `walletAccount.subscribe()`. You do not need to call this hook manually for that case.
{% endhint %}

## Related

- [`useRevokePermits`](/reference/react/useRevokePermits) — remove permits without touching the keypair
- [`useAllow`](/reference/react/useAllow) — sign permits for contracts
- [`useIsAllowed`](/reference/react/useIsAllowed) — check whether stored permits cover contracts
