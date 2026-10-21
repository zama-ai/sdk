---
title: useVaultBatcher
description: React hook returning a memoized VaultBatcher instance for one batcher contract.
---

# useVaultBatcher

Returns a memoized [`VaultBatcher`](../sdk/VaultBatcher.md) bound to the SDK in the current `ZamaProvider`. The instance is recreated only when the SDK or the address changes, so its cached address reads survive re-renders.

This is the low-level entry point — the batch hooks ([`useBatchState`](./useBatchState.md), [`useClaim`](./useClaim.md), …) call it internally. Most apps should use [`useVault`](./useVault.md), which pairs both directions and adds the operator-approval step to joins.

## Import

```ts
import { useVaultBatcher } from "@zama-fhe/react-sdk/vaults";
```

## Signature

```ts
function useVaultBatcher(address: Address): VaultBatcher;
```

### address

`Address`

The batcher contract address — the deposit or the redeem direction of a vault.

## Example

```tsx
import { useVaultBatcher } from "@zama-fhe/react-sdk/vaults";

function DepositedAmount({ batchId, account }: { batchId: bigint; account: `0x${string}` }) {
  const depositBatcher = useVaultBatcher("0xDepositBatcher");

  async function read() {
    const amount = await depositBatcher.depositOf(batchId, account);
    console.log("Joined:", amount.toString());
  }

  return <button onClick={read}>Read deposit</button>;
}
```

## Related

- [`VaultBatcher`](../sdk/VaultBatcher.md) — the underlying class
- [`useVault`](./useVault.md) — both directions behind one object
- [`useJoin`](./useJoin.md) — join a single batcher directly
