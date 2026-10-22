---
title: useClearCredentials
description: Wipe the transport key pair and all permits for the connected wallet.
---

# useClearCredentials

Wipe the transport key pair for the current signer and cascade-delete every permit (across chains and delegators) referencing it. Use this for "log out" handlers that should leave no trace.

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

- Wipes the transport key pair for the connected wallet.
- Cascade-deletes every permit across all chains and delegators.
- Auto-invalidates all [`useHasPermit`](./useHasPermit.md) queries on success.
- After clearing, any decrypt operation will generate a fresh transport key pair and prompt for new permits.

{% hint style="info" %}
By default, the SDK clears credentials on wallet disconnect or account change when the signer adapter implements `walletAccount.subscribe()`, so you do not need to call this hook for that case. If you set `clearCredentialsOnWalletChange: false` on `createConfig` (permits are stored per address and expire after `permitTTL`, so switching back to an account reuses its permits without a new signature), call this hook from your app's sign-out handler instead, before you disconnect the wallet: it needs a connected wallet account.
{% endhint %}

## Related

- [`useRevokePermits`](./useRevokePermits.md) — remove permits without touching the transport key pair
- [`useGrantPermit`](./useGrantPermit.md) — sign permits for contracts
- [`useHasPermit`](./useHasPermit.md) — check whether stored permits cover contracts
