---
title: VaultGroup
description: A set of confidential ERC-4626 vaults sharing one asset, joined together so a deposit hides which vault it went to.
---

# VaultGroup

`VaultGroup` joins several confidential ERC-4626 vaults as one. A deposit into one member joins _every_ member's current batch: the chosen vault carries the amount, the rest carry an encrypted zero, and an observer sees the same set of joins whichever vault was picked. See the [Multi-Vault Router](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router) concept page for why.

A group has at least two vaults and submits through the on-chain router in one transaction. For a single vault, use [`Vault`](Vault.md).

## Import

```ts
import { createVaultGroup, VaultGroup } from "@zama-fhe/sdk/vaults";
```

## Construction

Use `createVaultGroup(sdk, config)`:

```ts
import { createVaultGroup } from "@zama-fhe/sdk/vaults";

const group = createVaultGroup(sdk, {
  id: "stable",
  cAsset: "0xConfidentialAsset",
  router: "0xRouter",
  vaults: [
    { id: "alpha", depositBatcher: "0xAlphaDeposit", redeemBatcher: "0xAlphaRedeem" },
    { id: "beta", depositBatcher: "0xBetaDeposit", redeemBatcher: "0xBetaRedeem" },
    // …up to MAX_GROUP_VAULTS members
  ],
});

const { joins } = await group.deposit("alpha", 1_000_000n);
```

The constructor throws [`ConfigurationError`](errors.md#configurationerror) for fewer than two members, more than `MAX_GROUP_VAULTS` (10, the [documented leg limit](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router#leg-limits)) members, a duplicate member id, a `vault` address given for more than one member, or a batcher address that appears more than once. Ids are matched exactly; addresses are compared after checksumming.

### VaultGroupConfig

```ts
import { type VaultGroupConfig, type VaultMemberConfig } from "@zama-fhe/sdk/vaults";
```

| Field    | Type                           | Description                                                                                                                          |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`     | `string`                       | Stable identifier for the group, used in error messages.                                                                             |
| `cAsset` | `Address`                      | The confidential wrapper of the asset every member takes deposits in.                                                                |
| `router` | `Address`                      | The router that fans a submission out across the members.                                                                            |
| `vaults` | `readonly VaultMemberConfig[]` | The members, in the order their legs are submitted (at least two). That order is visible on chain, so treat it as part of the group. |

`VaultMemberConfig` extends [`VaultAddresses`](Vault.md#vaultaddresses) with the `id` callers pass to `deposit` / `redeem` to pick the vault:

| Field            | Type      | Description                                                                                                 |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `id`             | `string`  | The identifier callers pass to `deposit` / `redeem` to pick this vault.                                     |
| `vault`          | `Address` | Optional. The ERC-4626 vault contract; when given, both batchers must report it. Otherwise read from chain. |
| `depositBatcher` | `Address` | This vault's deposit batcher.                                                                               |
| `redeemBatcher`  | `Address` | This vault's redeem batcher. The share token is read from it on chain.                                      |

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

### router

`Address`

The router every submission goes through, checksummed.

### members

`readonly VaultGroupMember[]`

The members in leg order. `VaultGroupMember` is `{ id: string; vault: Vault }`: the id callers pass to `deposit` / `redeem`, and the [`Vault`](Vault.md) behind it.

## Reads

### member

`(vaultId: string) => VaultGroupMember`

One member by its id. Throws [`ConfigurationError`](errors.md#configurationerror) if the group has no such member.

```ts
const redeemBatcher = group.member("alpha").vault.redeemBatcher;
```

### isAssetListed

`() => Promise<boolean>`

Whether the router's registry lists `cAsset`, which a deposit requires. Listings are governed on chain and can be revoked, so the answer is not cached; the registry's address, which is immutable, is read once.

## Writes

### deposit

`(vaultId: string, amount: bigint, options?: JoinOptions) => Promise<VaultGroupJoinResult>`

Deposits `amount` of the shared asset into the member `vaultId`, joining every member's current deposit batch. `amount` is in the asset token's base units.

In order, the call:

1. Builds one leg per member from its configured deposit batcher — the chosen one carrying `amount`, the rest `0` — and verifies each member against chain: both of its batchers report the same vault (and the configured `vault`, if given), no two members report the same vault, the deposit batcher pulls `cAsset`, and it is not paused. Alongside, checks the router's registry lists `cAsset`.
2. Checks the caller's confidential balance of `cAsset` (skippable with `skipBalanceCheck`).
3. Encrypts the total against `cAsset` and the allocation against the router, and sends one `confidentialTransferAndCall` of the asset to the router. No operator is granted.
4. Reads the `Joined` event of every leg's batcher from the receipt and returns them.

```ts
const { txHash, joins } = await group.deposit("alpha", 1_000_000n);
```

Unlike `Vault.deposit` there is no `beneficiary`: the router credits the account the legs came from.

The submission emits a [`VaultSubmitted`](ZamaSDK.md#events) event with `vaultOperation: "routerJoin"` tagged with the router's address, in either direction.

**Throws:**

- [`ConfigurationError`](errors.md#configurationerror) — unknown `vaultId`, a member whose batchers disagree with its config or are not paired with `cAsset`, or two members whose batchers report the same vault. Thrown before any grant or transfer.
- [`VaultBatcherPausedError`](errors.md#vaultbatcherpausederror) — a member's batcher is paused, so the submission would revert. Names the member.
- [`SignerNotConfiguredError`](errors.md#signernotconfigurederror) — no signer on the SDK.
- [`InsufficientConfidentialBalanceError`](errors.md#insufficientconfidentialbalanceerror) — the asset balance is less than `amount`.
- [`BalanceCheckUnavailableError`](errors.md#balancecheckunavailableerror) — the balance check needs a decryption the signer can't perform; pass `skipBalanceCheck: true`.
- [`UnlistedConfidentialTokenError`](errors.md#unlistedconfidentialtokenerror) — the router's registry does not list the asset.
- [`TransactionRevertedError`](errors.md#transactionrevertederror) — the transaction was mined, but a leg's batcher reported no `Joined` event.

### redeem

`(vaultId: string, amount: bigint, options?: VaultGroupRedeemOptions) => Promise<VaultGroupJoinResult>`

Redeems `amount` shares of the member `vaultId` by joining every member's current redeem batch, each leg spending its own vault's share token. `amount` is denominated in **shares**, as with `Vault.redeem`. In order, the call:

1. Builds one leg per member from its configured redeem batcher and verifies each member as `deposit` does, with the redeem batcher paying out `cAsset` and each member's share token read from it. Alongside, reads the router's registry address, so a `router` with none fails before anything is granted to it.
2. Checks the caller's balance of the chosen member's share token, decrypting every member's share balance so the relayer cannot tell which was chosen (skippable with `skipBalanceCheck`).
3. Encrypts the allocation against the router.
4. Grants the router an operator approval on each share token that lacks one. Each grant is its own wallet prompt, so a first redemption from a group of N vaults can ask the user to sign up to N + 1 times.
5. Submits the router `join`.
6. Reads the `Joined` events.

```ts
const { joins } = await group.redeem("alpha", 500n);
```

Throws the same errors as `deposit`, except `UnlistedConfidentialTokenError`: redemption is not gated on the listing.

### Options

```ts
import { type JoinOptions, type VaultGroupRedeemOptions } from "@zama-fhe/sdk/vaults";
```

`deposit` takes `JoinOptions`; `redeem` takes `VaultGroupRedeemOptions`, which adds `operatorUntil`.

| Option             | Type      | Default      | Description                                                                                                                                         |
| ------------------ | --------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skipBalanceCheck` | `boolean` | `false`      | Skip the confidential-balance pre-flight. A short balance then joins every batch with an encrypted zero rather than reverting.                      |
| `operatorUntil`    | `number`  | now + 1 hour | Redeem only. Unix timestamp (seconds) until which the router's operator grant on each share token is valid, for a grant the redemption has to make. |

## VaultGroupJoinResult

```ts
import { type VaultGroupJoinResult, type VaultGroupJoin } from "@zama-fhe/sdk/vaults";
```

`VaultGroupJoinResult` extends `TransactionResult`, like `JoinResult` does:

| Field     | Type                        | Description                                              |
| --------- | --------------------------- | -------------------------------------------------------- |
| `txHash`  | `Hex`                       | The one transaction, through the router.                 |
| `receipt` | `TransactionReceipt`        | Its receipt.                                             |
| `vaultId` | `string`                    | The member the caller chose.                             |
| `joins`   | `readonly VaultGroupJoin[]` | One entry per leg, in group order — the decoys included. |

Each `VaultGroupJoin` has:

| Field                      | Type             | Description                                                                                                                                    |
| -------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `vaultId`                  | `string`         | The member this leg belongs to.                                                                                                                |
| `batcher`                  | `Address`        | The configured batcher it joined. Claim, quit and batch state happen here: `createVaultBatcher(sdk, batcher)`.                                 |
| `token`                    | `Address`        | The token the leg spent: `cAsset` for a deposit, the member's share token for a redemption.                                                    |
| `batchId`                  | `bigint`         | The batch the join landed in.                                                                                                                  |
| `confidentialJoinedAmount` | `EncryptedValue` | The encrypted amount credited — zero for every leg but the chosen one, and for that one too if `skipBalanceCheck` let a short balance through. |

## TanStack Query helpers

```ts
import { groupDepositMutationOptions, groupRedeemMutationOptions } from "@zama-fhe/sdk/vaults";
```

The React hooks are built on these; they are exported for non-React TanStack Query consumers and for custom compositions.

- `groupDepositMutationOptions(group)` / `groupRedeemMutationOptions(group)` — `group.deposit` / `group.redeem` as mutations taking `{ vaultId, amount, ...options }`. Keyed on `["zama.vaultGroup.deposit", { cAsset, batchers }]` (redeem likewise), where `batchers` are the direction's batcher addresses.
- On success the hooks call [`invalidateAfterJoin`](VaultBatcher.md#tanstack-query-helpers) once per entry in `joins`, with the batcher it joined and the token it spent. The redeem hook additionally invalidates operator status for each share token.

See [Query keys → `vaultQueryKeys`](../react/query-keys.md#vaultquerykeys) for the cache keys.

## Related

- [Vault](Vault.md) / [VaultBatcher](VaultBatcher.md) — the single-vault API, and where claiming lives
- [Vault groups](../../guides/vault-groups.md) — the integration guide
- [useVaultGroup](../react/useVaultGroup.md), [useGroupDeposit](../react/useGroupDeposit.md), [useGroupRedeem](../react/useGroupRedeem.md) — the React hooks
