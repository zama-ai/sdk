---
title: useVaultGroup
description: React hook returning a memoized VaultGroup instance for a set of vaults sharing one confidential asset.
---

# useVaultGroup

Returns a memoized [`VaultGroup`](../sdk/VaultGroup.md) bound to the SDK in the current `ZamaProvider`. The instance is memoized on `[sdk, config]`: pass a stable config object (a module constant or a memoized value), since a fresh object each render rebuilds the group.

A group has at least two vaults; [`useVault`](./useVault.md) covers a single vault.

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
  vaults: [
    { id: "alpha", depositBatcher: "0xAlphaDeposit", redeemBatcher: "0xAlphaRedeem" },
    { id: "beta", depositBatcher: "0xBetaDeposit", redeemBatcher: "0xBetaRedeem" },
  ],
} as const;

function Members() {
  const group = useVaultGroup(STABLE_GROUP);
  return (
    <ul>
      {group.members.map((member) => (
        <li key={member.id}>{member.id}</li>
      ))}
    </ul>
  );
}
```

## Related

- [`VaultGroup`](../sdk/VaultGroup.md) — the underlying class
- [`useGroupDeposit`](./useGroupDeposit.md) / [`useGroupRedeem`](./useGroupRedeem.md) — mutation hooks over `group.deposit()` / `group.redeem()`
- [Vault groups](../../guides/vault-groups.md)
