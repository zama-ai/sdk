---
title: VaultGroup
description: A set of confidential ERC-4626 vaults sharing one asset, joined together so a deposit hides which vault it went to.
---

# VaultGroup

`VaultGroup` joins several confidential ERC-4626 vaults as one. A deposit into one member joins _every_ member's current batch: the chosen vault carries the amount, the rest carry an encrypted zero, and an observer sees the same set of joins whichever vault was picked. See the [Vault groups](../../guides/vault-groups.md) guide for why.

A group of more than one vault submits through a [`VaultRouter`](VaultRouter.md) in one transaction. A single-vault group needs no router and joins its batcher directly, the way [`Vault`](Vault.md) does.

## Import

```ts
import { createVaultGroup, VaultGroup } from "@zama-fhe/sdk/vaults";
```

The `vaults` subpath is separate from the root entry, so apps that don't use vaults don't bundle it.

## Construction

Use `createVaultGroup(sdk, config)`:

```ts
import { createVaultGroup } from "@zama-fhe/sdk/vaults";

const group = createVaultGroup(sdk, {
  id: "stable",
  cAsset: "0xConfidentialAsset",
  router: "0xRouter",
  vaults: [
    {
      id: "alpha",
      vault: "0xAlphaVault",
      cShare: "0xAlphaShares",
      batchers: {
        deposit: { retired: [], latest: "0xAlphaDepositBatcher" },
        redeem: { retired: [], latest: "0xAlphaRedeemBatcher" },
      },
    },
    // …up to MAX_GROUP_VAULTS members
  ],
});

const { joins } = await group.deposit("alpha", 1_000_000n);
```

`createVaultGroup` is a thin factory over `new VaultGroup(sdk, config)`; both take the same arguments.

The constructor throws [`ConfigurationError`](errors.md#configurationerror) for a group with no members, more than `MAX_GROUP_VAULTS` (10, the [documented leg limit](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router#leg-limits)) members, a duplicate member id or `cShare`, or more than one member and no `router`.

### VaultGroupConfig

```ts
import { type VaultGroupConfig, type VaultMemberConfig } from "@zama-fhe/sdk/vaults";
```

| Field    | Type                           | Required       | Description                                                                                                           |
| -------- | ------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`     | `string`                       | yes            | Stable identifier for the group. Used in mutation keys.                                                               |
| `cAsset` | `Address`                      | yes            | The confidential wrapper of the asset every member takes deposits in.                                                 |
| `vaults` | `readonly VaultMemberConfig[]` | yes            | The members, in the order their legs are submitted. That order is visible on chain, so treat it as part of the group. |
| `router` | `Address`                      | for 2+ members | The [`VaultRouter`](VaultRouter.md) that fans a submission out across the members.                                    |

Each `VaultMemberConfig` has:

| Field      | Type                                                  | Description                                                                           |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `id`       | `string`                                              | The identifier callers pass to `deposit` / `redeem` to pick this vault.               |
| `vault`    | `Address`                                             | The ERC-4626 vault contract, as both of its batchers report it.                       |
| `cShare`   | `Address`                                             | The confidential wrapper of this vault's shares — the token its redeem batcher pulls. |
| `batchers` | `{ deposit: BatcherHistory; redeem: BatcherHistory }` | This vault's batchers per direction. See [BatcherHistory](#batcherhistory).           |

### BatcherHistory

```ts
import { type BatcherHistory, type RetiredBatcher } from "@zama-fhe/sdk/vaults";
```

A vault's batcher is replaced rather than upgraded, and a replaced batcher keeps accepting joins until its last configured batch is dispatched. So a member names a history, not an address:

| Field     | Type                        | Description                                                                                                 |
| --------- | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `retired` | `readonly RetiredBatcher[]` | Superseded batchers, oldest first. Each has an `address` and the `lastBatchId` it still accepts joins into. |
| `latest`  | `Address`                   | The batcher joins reach once every retired one is exhausted.                                                |

`resolveActiveBatcher(sdk, history)` is the standalone form of the lookup `activeBatchers()` runs per member.

## Properties

### sdk

`ZamaSDK`

The SDK instance this group reads and writes through.

### id

`string`

The group's identifier, as configured.

### cAsset

`Address`

The shared confidential asset wrapper, checksummed.

### vaults

`readonly VaultMemberConfig[]`

The members in leg order, with every address checksummed.

### router

`VaultRouter | undefined`

The fan-out router, or `undefined` for a single-vault group.

## Reads

### member

`(vaultId: string) => VaultMemberConfig`

One member by its id. Throws [`ConfigurationError`](errors.md#configurationerror) if the group has no such member.

```ts
const { vault, cShare } = group.member("alpha");
```

### activeBatchers

`(direction: "deposit" | "redeem") => Promise<Readonly<Record<string, Address>>>`

The batcher each member's next join in `direction` would reach, keyed by member id: the first retired batcher whose on-chain `currentBatchId` has not passed its `lastBatchId`, else `latest`. The handover happens when someone dispatches that last batch, not at a scheduled time, so this is read before every submission rather than cached.

```ts
const batchers = await group.activeBatchers("deposit");
// { alpha: "0xAlphaDepositBatcher", beta: "0xBetaDepositBatcher" }
```

## Writes

### deposit

`(vaultId: string, amount: bigint, options?: VaultGroupJoinOptions) => Promise<VaultGroupJoinResult>`

Deposits `amount` of the shared asset into the member `vaultId`, joining every member's current deposit batch. `amount` is in the asset token's base units.

In order, the call:

1. Checks the caller's confidential balance of `cAsset` (skippable with `skipBalanceCheck`).
2. Resolves the active deposit batcher of every member and builds one leg per member — the chosen one carrying `amount`, the rest `0`.
3. Checks each leg's batcher reports `cAsset` as the token it pulls and the member's `vault` as its vault. Both reads are cached per batcher.
4. Checks the asset is listed in the router's registry, encrypts the total and the allocation, and sends one `confidentialTransferAndCall` of the asset to the router. A single-vault group instead grants its batcher an operator approval on the asset if needed and submits one `join`, encrypted against that batcher.
5. Reads the `Joined` event of every leg's batcher from the receipts and returns them.

```ts
const { joins, transactions } = await group.deposit("alpha", 1_000_000n);
```

Unlike `Vault.deposit` there is no `beneficiary`: the router credits the account the legs came from.

**Throws:**

- [`ConfigurationError`](errors.md#configurationerror) — unknown `vaultId`, or a batcher that reports a different token or vault than the member is configured with. Thrown before any grant or transfer.
- [`SignerNotConfiguredError`](errors.md#signernotconfigurederror) — no signer on the SDK.
- [`InsufficientConfidentialBalanceError`](errors.md#insufficientconfidentialbalanceerror) — the asset balance is less than `amount`.
- [`BalanceCheckUnavailableError`](errors.md#balancecheckunavailableerror) — the balance check needs a decryption the signer can't perform; pass `skipBalanceCheck: true`.
- [`UnlistedConfidentialTokenError`](errors.md#unlistedconfidentialtokenerror) — the router's registry does not list the asset.

### redeem

`(vaultId: string, amount: bigint, options?: VaultGroupJoinOptions) => Promise<VaultGroupJoinResult>`

Redeems `amount` shares of the member `vaultId` by joining every member's current redeem batch, each leg spending its own vault's share token. Same flow as `deposit`, except that the router pulls each share token and so is granted an operator approval on every one of them first, where none is active. `amount` is denominated in **shares**, as with `Vault.redeem`.

```ts
const { joins } = await group.redeem("alpha", 500n);
```

Throws the same errors as `deposit`, checking the balance of the chosen member's `cShare` instead of `cAsset`.

### VaultGroupJoinOptions

```ts
import { type VaultGroupJoinOptions } from "@zama-fhe/sdk/vaults";
```

| Option             | Type      | Default      | Description                                                                                                                                                                                                                       |
| ------------------ | --------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operatorUntil`    | `number`  | now + 1 hour | Unix timestamp (seconds) until which an operator grant made for this submission is valid — the router's on each share token, or the batcher's on the asset for a single-vault group. Only used when a grant isn't already active. |
| `skipBalanceCheck` | `boolean` | `false`      | Skip the confidential-balance pre-flight. A short balance then joins every batch with an encrypted zero rather than reverting.                                                                                                    |

## VaultGroupJoinResult

```ts
import { type VaultGroupJoinResult, type VaultGroupJoin } from "@zama-fhe/sdk/vaults";
```

| Field          | Type                           | Description                                                              |
| -------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `vaultId`      | `string`                       | The member the caller chose.                                             |
| `transactions` | `readonly TransactionResult[]` | The router transaction, or the single batcher join of a one-vault group. |
| `joins`        | `readonly VaultGroupJoin[]`    | One entry per leg, in group order — the decoys included.                 |

Each `VaultGroupJoin` has:

| Field                      | Type             | Description                                                                                                                         |
| -------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `vaultId`                  | `string`         | The member this leg belongs to.                                                                                                     |
| `batcher`                  | `Address`        | The batcher it joined, as resolved at submission time. Claim, quit and batch state happen here: `createVaultBatcher(sdk, batcher)`. |
| `batchId`                  | `bigint`         | The batch the join landed in.                                                                                                       |
| `confidentialJoinedAmount` | `EncryptedValue` | The encrypted amount credited — zero for every leg but the chosen one.                                                              |

## Related

- [VaultRouter](VaultRouter.md) — the contract a multi-vault submission goes through
- [Vault](Vault.md) / [VaultBatcher](VaultBatcher.md) — the single-vault API, and where claiming lives
- [Vault groups](../../guides/vault-groups.md) — what a group hides and what it costs
- [useVaultGroup](../react/useVaultGroup.md), [useGroupDeposit](../react/useGroupDeposit.md), [useGroupRedeem](../react/useGroupRedeem.md) — the React hooks
