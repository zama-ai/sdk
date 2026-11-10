---
title: useExit
description: Mutation hook that exits every leg of a vault join — payout for settled batches, refund for the rest.
---

# useExit

Mutation hook that exits every leg of a join. For each leg, it quits a pending batch (refund), claims a finalized batch (payout), or recovers a canceled batch (refund). Same flow as [`VaultClient.exit`](../sdk/VaultClient.md#exit).

The hook always covers every leg, decoys included. Exiting only the chosen vault's leg would show which vault the user picked.

## Import

```ts
import { useExit } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="ExitButton.tsx" %}

```tsx
import { useExit, usePosition } from "@zama-fhe/react-sdk/vaults";
import type { VaultRecord } from "@zama-fhe/sdk/vaults";
import { VAULTS } from "./vaults";

function ExitButton({ record }: { record: VaultRecord<typeof VAULTS> }) {
  const { data: position } = usePosition(VAULTS, record);
  const exit = useExit(VAULTS);

  if (!position?.availableActions.includes("exit")) return null;

  return (
    <button disabled={exit.isPending} onClick={() => exit.mutate(record)}>
      {exit.isPending ? "Withdrawing..." : "Withdraw"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### config

`VaultsConfig`

The config returned by [`defineVaults`](../sdk/VaultClient.md#definevaults).

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

The join record, passed directly to `mutate` / `mutateAsync`:

```tsx
exit.mutate(record);
```

The hook sends one transaction per leg, so a group of N vaults takes N wallet prompts. When a leg is still pending, only the account that joined can quit it, so the wallet must be that account.

Exits are safe to repeat. An exited leg holds an encrypted zero, so exiting it again moves nothing.

**Throws:**

- `VaultActionNotAllowedError` (reason `"leg-dispatched"`): a leg is dispatched. Wait for it to settle, or finalize it with [`useFinalize`](./useFinalize.md).
- `ConfigurationError`: a leg is pending and the signer is not the record's `account`, or the record does not match the config.
- `ChainMismatchError`: the wallet is not on the config's chain.

## Return Type

The `data` property (after a successful mutation) is `{ txHashes: Hex[] }`: every transaction sent, in order.

On success, the hook invalidates every vault read of the group and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [usePosition](./usePosition.md): when `exit` is available
- [Building a vault UI](../../guides/vaults/building-a-ui.md#ready): what exit does for the user in each case
- [VaultClient.exit](../sdk/VaultClient.md#exit)
