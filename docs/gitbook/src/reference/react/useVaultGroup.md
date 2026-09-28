---
title: useVaultGroup
description: React hook returning a memoized VaultGroup instance for a set of vaults sharing one confidential asset.
---

# useVaultGroup

Returns a memoized [`VaultGroup`](../sdk/VaultGroup.md) bound to the SDK in the current `ZamaProvider`. The instance is recreated only when the SDK or the config object changes.

This is the surface to reach for when depositing into one of several vaults; [`useVault`](./useVault.md) covers a single vault with no fan-out.

## Import

```ts
import { useVaultGroup } from "@zama-fhe/react-sdk/vaults";
```

The `vaults` subpath is separate from the root entry, so apps that don't use vaults don't bundle it.

## Signature

```ts
function useVaultGroup(config: VaultGroupConfig): VaultGroup;
```

### config

`VaultGroupConfig`

The group: its shared asset, its members with their batcher histories, and the router. See [`VaultGroup` → VaultGroupConfig](../sdk/VaultGroup.md#vaultgroupconfig). The constructor's configuration checks run here, so a malformed group throws on first render.

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

The hook memoizes on the config object's identity. Define it outside the component, or memoize it, or every render builds a new group.

## Related

- [`VaultGroup`](../sdk/VaultGroup.md) — the underlying class
- [`useGroupDeposit`](./useGroupDeposit.md) / [`useGroupRedeem`](./useGroupRedeem.md) — mutation hooks over `group.deposit()` / `group.redeem()`
- [`useActiveBatchers`](./useActiveBatchers.md) — the batcher each member would join right now
- [Vault groups](../../guides/vault-groups.md)
