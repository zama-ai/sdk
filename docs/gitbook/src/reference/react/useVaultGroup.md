---
title: useVaultGroup
description: React hook returning a memoized VaultGroup instance for a set of vaults sharing one confidential asset.
---

# useVaultGroup

Returns a memoized [`VaultGroup`](../sdk/VaultGroup.md) bound to the SDK in the current `ZamaProvider`. The instance is recreated only when the SDK or the config's contents change, and hooks that name the same group share it.

This is the surface to reach for when depositing into one of several vaults; [`useVault`](./useVault.md) covers a single vault with no fan-out.

## Import

```ts
import { useVaultGroup } from "@zama-fhe/react-sdk/vaults";
```

## Signature

```ts
function useVaultGroup(config: VaultGroupConfig): VaultGroup;
```

### config

`VaultGroupConfig`

The group: its shared asset, its members with their batchers, and the router. See [`VaultGroup` → VaultGroupConfig](../sdk/VaultGroup.md#vaultgroupconfig). The constructor's configuration checks run here, so a malformed group throws on first render.

## Example

```tsx
import { useVaultGroup } from "@zama-fhe/react-sdk/vaults";

const STABLE_GROUP = {
  id: "stable",
  cAsset: "0xConfidentialAsset",
  router: "0xRouter",
  vaults: [/* … */],
} as const;

function Members() {
  const group = useVaultGroup(STABLE_GROUP);
  return (
    <ul>
      {group.vaults.map((member) => (
        <li key={member.id}>{member.id}</li>
      ))}
    </ul>
  );
}
```

The hook memoizes on the config's contents rather than its identity, so an inline config is fine. Every hook that takes a `group` (`useGroupDeposit`, `useGroupRedeem`) goes through this one and shares the same instance, including its cached balance and batcher reads.

## Related

- [`VaultGroup`](../sdk/VaultGroup.md) — the underlying class
- [`useGroupDeposit`](./useGroupDeposit.md) / [`useGroupRedeem`](./useGroupRedeem.md) — mutation hooks over `group.deposit()` / `group.redeem()`
- [Vault groups](../../guides/vault-groups.md)
