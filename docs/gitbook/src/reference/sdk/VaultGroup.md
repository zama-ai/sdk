---
title: VaultGroup
description: A set of confidential ERC-4626 vaults sharing one asset, joined together so a deposit hides which vault it went to.
---

# VaultGroup

`VaultGroup` joins several confidential ERC-4626 vaults as one. A deposit into one member joins _every_ member's current batch: the chosen vault carries the amount, the rest carry an encrypted zero, and an observer sees the same set of joins whichever vault was picked. See the [Multi-Vault Router](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router) concept page for why.

A group submits through the on-chain router in one transaction. A group of one has no decoy to hide among, so it joins its only batcher directly; `Vault` is the same vault without the group vocabulary.

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

The constructor throws [`ConfigurationError`](errors.md#configurationerror) for an empty group, more than `MAX_GROUP_VAULTS` (10, the [documented leg limit](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router#leg-limits)) members, a duplicate member id, a `vault` or `cShare` address given for more than one member, or a batcher address that appears more than once. Ids are matched exactly; addresses are compared after checksumming.

### VaultGroupConfig

```ts
import { type VaultGroupConfig, type VaultMemberConfig } from "@zama-fhe/sdk/vaults";
```

| Field               | Type                           | Description                                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | `string`                       | Stable identifier for the group, used in error messages.                                                                                                                                                                                                                  |
| `cAsset`            | `Address`                      | The confidential wrapper of the asset every member takes deposits in.                                                                                                                                                                                                     |
| `router`            | `Address`                      | Optional. The router that fans a `"router"` submission out across the members. A group of one, or a host that only prepares `"legs"` deliveries, needs none.                                                                                                              |
| `vaults`            | `readonly VaultMemberConfig[]` | The members, in the order their legs are submitted. That order is visible on chain, so treat it as part of the group.                                                                                                                                                     |
| `allowCustomRouter` | `boolean`                      | Optional, default `false`. A `"router"` submission throws `ConfigurationError` when `router` is not the chain preset's `vaultRouterAddress`, even with `skipPreflight`. Set this only for a router you deployed yourself. Chains without a preset router are not checked. |

`VaultMemberConfig` extends [`VaultAddresses`](Vault.md#vaultaddresses) with the `id` callers pass to `deposit` / `redeem` to pick the vault:

| Field            | Type      | Description                                                                                                                                                            |
| ---------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | `string`  | The identifier callers pass to `deposit` / `redeem` to pick this vault.                                                                                                |
| `vault`          | `Address` | Optional. The ERC-4626 vault contract; when given, both batchers must report it. Otherwise read from chain.                                                            |
| `depositBatcher` | `Address` | This vault's deposit batcher.                                                                                                                                          |
| `redeemBatcher`  | `Address` | This vault's redeem batcher. The share token is read from it on chain unless `cShare` gives it.                                                                        |
| `cShare`         | `Address` | Optional. The vault's confidential share token. Spares `prepareRedeem` the read, feeds `redeemOperators`, and is checked against the redeem batcher by the pre-flight. |

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

`Address | undefined`

The router a `"router"` submission goes through, checksummed; `undefined` when the config names none.

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

A router submission emits a [`VaultSubmitted`](ZamaSDK.md#events) event with `vaultOperation: "routerJoin"` tagged with the router's address, in either direction. A group of one joins its batcher directly and emits `vaultOperation: "join"` tagged with the batcher.

**Throws:**

- [`ConfigurationError`](errors.md#configurationerror) — unknown `vaultId`, a member whose batchers disagree with its config or are not paired with `cAsset`, or two members whose batchers report the same vault. Thrown before any grant or transfer.
- [`VaultBatcherPausedError`](errors.md#vaultbatcherpausederror) — a member's batcher is paused, so the submission would revert. Names the member.
- [`SignerNotConfiguredError`](errors.md#signernotconfigurederror) — no signer on the SDK.
- [`InsufficientConfidentialBalanceError`](errors.md#insufficientconfidentialbalanceerror) — the asset balance is less than `amount`.
- [`BalanceCheckUnavailableError`](errors.md#balancecheckunavailableerror) — the balance check needs a decryption the signer can't perform; pass `skipBalanceCheck: true`.
- [`UnlistedConfidentialTokenError`](errors.md#unlistedconfidentialtokenerror) — the router's registry does not list the asset.
- [`VaultGroupJoinUnconfirmedError`](errors.md#vaultgroupjoinunconfirmederror) — the transaction was mined, but the SDK could not match a `Joined` event to every leg. Carries the `txHash`, the `receipt`, the `joins` it could match and the `unconfirmed` member ids. The router is all-or-nothing, so either nothing moved or every leg joined, the unconfirmed ones included; look the transaction up before resubmitting.

### redeem

`(vaultId: string, amount: bigint, options?: VaultGroupRedeemOptions) => Promise<VaultGroupJoinResult>`

Redeems `amount` shares of the member `vaultId` by joining every member's current redeem batch, each leg spending its own vault's share token. `amount` is denominated in **shares**, as with `Vault.redeem`. In order, the call:

1. Builds one leg per member from its configured redeem batcher and verifies each member as `deposit` does, with the redeem batcher paying out `cAsset` and each member's share token read from it. Alongside, reads the router's registry address, so a `router` with none fails before anything is granted to it.
2. Checks the caller's balance of the chosen member's share token, decrypting every member's share balance so the relayer cannot tell which was chosen (skippable with `skipBalanceCheck`).
3. Encrypts the allocation against the router.
4. Grants the router an operator approval on each share token that lacks one, as [`missingOperators`](#missingoperators) reports. Each grant is its own wallet prompt, so a first redemption from a group of N vaults can ask the user to sign up to N + 1 times.
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

| Option             | Type      | Default             | Description                                                                                                                                                                                                                     |
| ------------------ | --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skipBalanceCheck` | `boolean` | `false`             | Skip the confidential-balance pre-flight. A short balance then joins every batch with an encrypted zero rather than reverting.                                                                                                  |
| `operatorUntil`    | `number`  | chain time + 1 hour | Redeem only. Unix timestamp (seconds) until which the router's operator grant on each share token is valid, for a grant the redemption has to make. The default is the chain's current time plus one hour, not the local clock. |

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

## Prepare

`deposit` and `redeem` sign through the SDK's signer and wait for the receipt. A host with its own transaction pipeline — a queue, a bundler, an EIP-5792 `wallet_sendCalls` batch — uses the prepare methods instead. They do everything up to the send: the pre-flight, the balance check, the encryptions, and the calls. They are what `deposit` and `redeem` are built on.

### prepareDeposit

`(vaultId: string, amount: bigint, options?: PrepareVaultGroupJoinOptions) => Promise<PreparedVaultGroupJoin>`

### prepareRedeem

`(vaultId: string, amount: bigint, options?: PrepareVaultGroupJoinOptions) => Promise<PreparedVaultGroupJoin>`

Both throw what `deposit` and `redeem` throw before the send, except `VaultGroupJoinUnconfirmedError`, which belongs to the host's receipt handling.

```ts
const prepared = await group.prepareDeposit("alpha", 1_000_000n, { delivery: "legs" });
const calls = prepared.writes.map(({ call }) => ({
  to: call.address,
  data: encodeFunctionData(call),
}));
// …send `calls` atomically, then:
const { joins, unconfirmed } = prepared.decodeJoins(receipt.logs);
```

### Options

```ts
import { type PrepareVaultGroupJoinOptions, type JoinDelivery } from "@zama-fhe/sdk/vaults";
```

| Option             | Type           | Default             | Description                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account`          | `Address`      | the signer's wallet | The account the legs come from. The balance check decrypts as the signer, so an `account` other than the signer's (or no signer) throws `ConfigurationError` unless `skipBalanceCheck` is passed.                                                                                                                                                        |
| `delivery`         | `JoinDelivery` | `"router"`          | `"router"`: one transaction through the router. `"legs"`: one transfer per member straight to its batcher, for a wallet that lands them atomically; sent one by one, a user who stops partway reveals the rest. A group of one always goes `"legs"`.                                                                                                     |
| `skipBalanceCheck` | `boolean`      | `false`             | Skip the confidential-balance pre-flight.                                                                                                                                                                                                                                                                                                                |
| `skipPreflight`    | `boolean`      | `false`             | Skip the chain reads that verify the group: each member's batchers against its config, and the registry listing for a router deposit. `paused()` is always read on every batcher a leg would join and throws `VaultBatcherPausedError`. For a host that verified the group itself. A member's share token is still read when `cShare` is not configured. |

### PreparedVaultGroupJoin

```ts
import {
  type PreparedVaultGroupJoin,
  type PreparedVaultGroupWrite,
  type VaultGroupLeg,
  type VaultGroupOperator,
} from "@zama-fhe/sdk/vaults";
```

| Field               | Type                                 | Description                                                                                                                                                                    |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `direction`         | `"deposit" \| "redeem"`              |                                                                                                                                                                                |
| `vaultId`           | `string`                             | The member the caller chose.                                                                                                                                                   |
| `account`           | `Address`                            | The account the legs come from.                                                                                                                                                |
| `delivery`          | `JoinDelivery`                       | The delivery the writes take.                                                                                                                                                  |
| `legs`              | `readonly VaultGroupLeg[]`           | One per member, in group order: `{ vaultId, batcher, token, amount }`, the chosen member's `amount` and zero for the rest.                                                     |
| `writes`            | `readonly PreparedVaultGroupWrite[]` | The calls to send, in order, each with the `leg` it funds: one through the router carrying the chosen leg, or one per leg. A `call` is `{ address, abi, functionName, args }`. |
| `requiredOperators` | `readonly VaultGroupOperator[]`      | `{ vaultId, token, spender }` grants the writes rely on: the router on each share token of a `"router"` redemption, otherwise none. Grant the ones the account lacks first.    |
| `decodeJoins(logs)` | `(logs) => { joins, unconfirmed }`   | Pairs each leg with its `Joined` log in the mined receipts' logs, in leg order, and lists the members without one instead of throwing.                                         |

### missingOperators

`(prepared) => Promise<readonly VaultGroupOperator[]>`

The grants in `prepared.requiredOperators` that `prepared.account` lacks at the current block (`Token.isOperator`). `redeem` grants exactly these; a host sending its own writes makes them first. The check answers for now, so give each grant an `until` that outlasts the time the writes take to land.

```ts
const missing = await group.missingOperators(prepared);
```

### redeemOperators

`(delivery?: JoinDelivery) => readonly VaultGroupOperator[]`

The grants a redemption with `delivery` (default `"router"`) relies on, from the config alone, so a host can check them before preparing anything: the router on every member's `cShare` for `"router"`, none for `"legs"` or a group of one. Throws [`ConfigurationError`](errors.md#configurationerror) for a `"router"` delivery when a member's config gives no `cShare`, or the config names no router.

`vaultGroupRedeemOperators(config, delivery?)`, exported beside the class, gives the same answer from a `VaultGroupConfig` alone, for the parts of a host's pipeline that run with the config in hand but no SDK instance in scope, such as the guard that decides whether a grant transaction is needed.

### decodeVaultGroupJoins

`(prepared: { legs, account }, logs) => DecodedVaultGroupJoins`

```ts
import { decodeVaultGroupJoins, type DecodedVaultGroupJoins } from "@zama-fhe/sdk/vaults";
```

What `prepared.decodeJoins` does, from plain data, so a host that saved `legs` and `account` can decode after a reload. Returns `{ joins, unconfirmed }`. For a `"legs"` delivery pass the logs of every receipt in leg order. For a partly sent `"legs"` delivery, `unconfirmed` lists the legs still to send.

```ts
const { joins, unconfirmed } = decodeVaultGroupJoins({ legs, account }, receipt.logs);
```

## Call builders

```ts
import {
  routerJoinContract,
  encodeAllocationData,
  tokenWrapperRegistryContract,
  type EncryptedAllocationLeg,
} from "@zama-fhe/sdk/vaults";
import { confidentialTransferAndCallContract } from "@zama-fhe/sdk";
```

`deposit` and `redeem` are built on pure builders, exported for apps that submit through their own transaction pipeline. Each takes legs already encrypted against the router — `EncryptedAllocationLeg` is `{ batcher, token, amount: EncryptedValue }` — and the `inputProof` of that encryption. Encrypt every member's amount in one `sdk.encrypt` call with `contractAddress` set to the router, so the proof covers the whole allocation.

| Builder                                        | Path                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `encodeAllocationData(legs, inputProof)`       | Push (deposit): the `data` of one `confidentialTransferAndCall` of `cAsset` to the router. Pair it with `confidentialTransferAndCallContract` from the root entry. |
| `routerJoinContract(router, legs, inputProof)` | Pull (redeem): the router's `join`. Each leg's share token needs an operator grant to the router first; `setOperatorContract` builds that.                         |
| `tokenWrapperRegistryContract(router)`         | Reads the registry the push path is gated on; check `cAsset` against it with `isConfidentialTokenValidContract`.                                                   |

A builder encodes a call and nothing else. The verification `deposit` and `redeem` do first — members against chain, paused batchers, the registry listing, the balance check — is yours to repeat.

## TanStack Query helpers

```ts
import {
  groupDepositMutationOptions,
  groupRedeemMutationOptions,
  invalidateAfterGroupJoin,
} from "@zama-fhe/sdk/vaults";
```

The React hooks are built on these; they are exported for non-React TanStack Query consumers and for custom compositions.

- `groupDepositMutationOptions(group)` / `groupRedeemMutationOptions(group)` — `group.deposit` / `group.redeem` as mutations taking `{ vaultId, amount, ...options }`. Keyed on `["zama.vaultGroup.deposit", { cAsset, batchers }]` (redeem likewise), where `batchers` are the direction's batcher addresses.
- `invalidateAfterGroupJoin(queryClient, legs)` takes `prepared.legs` or a result's `joins`, and invalidates each leg's token balance and batcher batch reads. Call it after sending the writes yourself.
- Once the transaction is mined, the hooks call it, so they invalidate what [`invalidateAfterJoin`](VaultBatcher.md#tanstack-query-helpers) covers for every member: the balance of each token the legs spent (`cAsset` once for a deposit, each share token for a redemption) and each batcher's batch reads. This runs on success and on `VaultGroupJoinUnconfirmedError` alike, since a mined transaction joined every leg. The redeem hook additionally invalidates operator status for each share token.

See [Query keys → `vaultQueryKeys`](../react/query-keys.md#vaultquerykeys) for the cache keys.

## Related

- [Vault](Vault.md) / [VaultBatcher](VaultBatcher.md) — the single-vault API, and where claiming lives
- [Vault groups](../../guides/vaults/groups.md) — the integration guide
- [useVaultGroup](../react/useVaultGroup.md), [useGroupDeposit](../react/useGroupDeposit.md), [useGroupRedeem](../react/useGroupRedeem.md) — the React hooks
