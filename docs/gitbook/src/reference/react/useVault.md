---
title: useVault
description: React hook returning a memoized Vault instance for a deposit/redeem batcher pair.
---

# useVault

Returns a memoized [`Vault`](../sdk/Vault.md) bound to the SDK in the current `ZamaProvider`. The instance is recreated only when the SDK or one of the addresses changes, so its cached reads (`vaultAddress()`, `cAsset()`, `cShare()`) survive re-renders.

Most apps should use this — together with [`useDeposit`](./useDeposit.md) / [`useRedeem`](./useRedeem.md) — and reach for [`useVaultBatcher`](./useVaultBatcher.md) only for direct single-direction access.

## Import

```ts
import { useVault } from "@zama-fhe/react-sdk/vaults";
```

The `vaults` subpath is separate from the root entry, so apps that don't use vaults don't bundle it.

## Signature

```ts
function useVault(addresses: VaultAddresses): Vault;
```

### addresses

`VaultAddresses`

The vault's `depositBatcher` and `redeemBatcher` addresses, and optionally the `vault` contract itself. Passing `vault` doesn't skip the on-chain read: the SDK verifies it against what both batchers report and throws a `ConfigurationError` on a mismatch. See [`Vault` → VaultAddresses](../sdk/Vault.md#vaultaddresses).

## Example

```tsx
import { useVault } from "@zama-fhe/react-sdk/vaults";

const addresses = {
  vault: "0xVault",
  depositBatcher: "0xDepositBatcher",
  redeemBatcher: "0xRedeemBatcher",
} as const;

function BatchStatus({ batchId }: { batchId: bigint }) {
  const vault = useVault(addresses);

  async function check() {
    const state = await vault.depositBatcher.batchState(batchId);
    console.log("Batch state:", state);
  }

  return <button onClick={check}>Check batch</button>;
}
```

Define `addresses` outside the component, or memoize it, so its identity is stable across renders.

## Related

- [`Vault`](../sdk/Vault.md) — the underlying class
- [`useDeposit`](./useDeposit.md) / [`useRedeem`](./useRedeem.md) — mutation hooks over `vault.deposit()` / `vault.redeem()`
- [`useVaultBatcher`](./useVaultBatcher.md) — single-batcher variant
- [Vault deposits and redemptions](../../guides/vault-deposits.md)
