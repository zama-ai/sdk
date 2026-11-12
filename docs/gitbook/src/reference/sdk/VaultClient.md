---
title: VaultClient
description: Reference for defineVault, defineVaultGroup, createVaultClient and the VaultClient methods and types.
---

# VaultClient

The client for confidential ERC-4626 vaults. For how batches, keepers and groups work, see the [Vaults overview](../../guides/vaults/README.md).

## Import

```ts
import {
  createVaultClient,
  defineVault,
  defineVaultGroup,
  type VaultClient,
} from "@zama-fhe/sdk/vaults";
```

## defineVault

`defineVault(vault) => Vault`

Returns `vault` unchanged, with its `id` kept as a literal type. Like viem's `defineChain`, it checks nothing and reads nothing. The SDK ships no vault, so use your own addresses.

```ts
export const ALPHA = defineVault({
  id: "alpha",
  chainId: 1,
  batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" },
});
```

### Vault

| Field      | Type                                                                        | Description                                                                 |
| ---------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `id`       | `string`                                                                    | Names the vault in `vaultId`, errors and query keys.                        |
| `chainId`  | `number`                                                                    | The chain the vault's batchers are on. Reads go to it, whatever the wallet. |
| `batchers` | `{ deposit: Address \| BatcherHistory; redeem: Address \| BatcherHistory }` | The batcher each direction joins: an address, or a history once upgraded.   |

A vault names no token: the client reads each batcher's `fromToken()`. A join or read throws `ConfigurationError` for an invalid batcher address or `lastBatchId`.

### BatcherHistory

| Field     | Type                                          | Description                                                                               |
| --------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `retired` | `{ address: Address; lastBatchId: bigint }[]` | Replaced batchers, oldest first. `lastBatchId` is the last batch joins may land in there. |
| `latest`  | `Address`                                     | The batcher joins reach once every retired one is past its `lastBatchId`.                 |

See [Upgrade a batcher](../../guides/vaults/advanced.md#upgrade-a-batcher).

## defineVaultGroup

`defineVaultGroup(group) => VaultGroup`

Returns `group` unchanged, with its ids kept as literal types, so a typo in `vaultId` is a type error. It checks nothing. A vault can be in several groups and still be joined on its own.

```ts
export const STABLE = defineVaultGroup({ id: "stable", vaults: [ALPHA, BETA] });
```

### VaultGroup

| Field    | Type      | Description                                                                         |
| -------- | --------- | ----------------------------------------------------------------------------------- |
| `id`     | `string`  | Names the group in errors and query keys.                                           |
| `vaults` | `Vault[]` | The vaults, in leg order: at least two (a type error otherwise), up to `MAX_GROUP_VAULTS`. |

The vaults must be on one chain, and their deposit batchers must take the same asset. A join or read throws `ConfigurationError` when a group has more than `MAX_GROUP_VAULTS` vaults, mixes chains, or names a vault twice. A deposit also throws it when the deposit batchers take different assets.

`VaultIdOf<typeof STABLE>` is the union of a group's vault ids.

### MAX_GROUP_VAULTS

`number`. The most vaults a group may hold: the FHE compute of a join grows with its legs, and this many fit in one transaction.

## createVaultClient

`createVaultClient(sdk: ZamaSDK) => VaultClient`

Returns a client bound to the [`ZamaSDK`](ZamaSDK.md). It reads nothing until first used and holds no config, so one client serves every group and chain. `VaultClient` is exported as a type only. In React, use [`useVaultClient`](../react/useVaultClient.md).

## Prepare a join

The `prepare*` join methods read the chain, check the join, and encrypt, then return the calls without sending them. See [Send through your own pipeline](../../guides/vaults/advanced.md#send-through-your-own-pipeline).

### prepareDeposit

`prepareDeposit(target, input, options?) => Promise<PreparedJoin>`

Builds a deposit of the asset into one vault: a leg for every vault of a group, or one call for a vault on its own. Only `input.account` can send the calls.

| Parameter | Type                          | Description                                 |
| --------- | ----------------------------- | ------------------------------------------- |
| `target`  | `Vault \| VaultGroup`         | The group, or a vault to join on its own.   |
| `input`   | [`JoinInput`](#joininput)     | The account, the amount, and for a group the `vaultId`. |
| `options` | [`JoinOptions`](#joinoptions) | The balance check, and for a group the route. |

**Throws:**

- `ChainMismatchError` when a wallet is connected and the provider is not on the target's chain.
- `ConfigurationError` when the provider is not on the target's chain with no wallet connected, the vault is not in the group, the group is invalid (see [`VaultGroup`](#vaultgroup)), or the join uses the router and the chain has none.
- `VaultBatcherPausedError` when a batcher the join reaches is paused. This check always runs.
- `InsufficientConfidentialBalanceError` when the balance is below `amount`.
- `BalanceCheckUnavailableError` when the balance cannot be decrypted: no signer is connected, or `account` is not the signer. Pass `skipBalanceCheck: true`.

### prepareRedeem

`prepareRedeem(target, input, options?) => Promise<PreparedJoin>`

Builds a redemption of one vault's shares. Same parameters and errors as `prepareDeposit`, with `amount` in shares. On the router route, `calls` starts with an operator approval of the router on each share token the account has not approved, valid for a year.

### How a join is routed

| Target                           | `route`    | `calls`                                                                                   |
| -------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| A vault on its own               | `"direct"` | One transfer to its batcher.                                                              |
| A group, deposit, `"router"`     | `"router"` | One transfer of the asset to the router, which funds every leg.                           |
| A group, redeem, `"router"`      | `"router"` | The missing operator approvals, then one router call that pulls every leg's share token. |
| A group, `"direct"`              | `"direct"` | One transfer per vault, straight to its batcher. Send them as one atomic bundle.          |

## Prepare a batch action

Each batch action takes the batch as a [`BatchRef`](#batchref), which names its batcher rather than its vault, so it survives a batcher upgrade. `prepareClaim`, `prepareQuit` and `prepareDispatch` read nothing: read the batch with [`readBatch`](#readbatch) before you send them.

| Method                       | Returns                     | Builds                                                                                                  | Who may send it |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- | --------------- |
| `prepareClaim(batch, account)` | `Call`                    | The claim of a finalized batch. It pays `account`, whoever sends it.                                    | Anyone          |
| `prepareQuit(batch)`         | `Call`                      | The refund of the sender's deposit from a pending or canceled batch.                                   | The depositor   |
| `prepareDispatch({ chainId, batcher })` | `Call`           | The dispatch of the batcher's open batch. It reverts while the batch is too young or the batcher is paused. | Anyone   |
| `prepareFinalize(batch)`     | `Promise<PreparedFinalize>` | The settlement of a dispatched batch, with its publicly decrypted amount. Past `cancelsAt`, it cancels the batch instead. | Anyone |

`prepareFinalize` throws:

- `VaultBatchNotDispatchedError` when the batch is not dispatched. The error carries the batch's `state`.
- `ChainMismatchError` when a wallet is connected and the provider is not on the batch's chain.
- `ConfigurationError` when the provider is not on the batch's chain with no wallet connected.

## Send methods

Each send method prepares the same calls as its `prepare*` counterpart, signs them with the SDK's signer, and waits for the receipts. All of them throw:

- `SignerNotConfiguredError` when the SDK has no signer.
- `ChainMismatchError` when the wallet is not on the target's or batch's chain.

| Method                                 | Returns                      | Notes                                                            |
| -------------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `deposit(target, input, options?)`     | `Promise<JoinOutcome>`       | Throws as `prepareDeposit`, and `VaultJoinUnconfirmedError`      |
| `redeem(target, input, options?)`      | `Promise<JoinOutcome>`       | Throws as `prepareRedeem`, and `VaultJoinUnconfirmedError`       |
| `claim(batch, account?)`               | `Promise<TransactionResult>` | `account` defaults to the signer.                                |
| `quit(batch)`                          | `Promise<TransactionResult>` | The signer must be the depositor.                                |
| `dispatch({ chainId, batcher })`       | `Promise<TransactionResult>` |                                                                  |
| `finalize(batch)`                      | `Promise<TransactionResult>` | Throws as `prepareFinalize`                                      |

`deposit` and `redeem` take the input without `account`, which is the signer, and these options:

| Option             | Type                    | Description                                                                                         |
| ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `skipBalanceCheck` | `boolean`               | Skips the balance check. Default `false`.                                                           |
| `onJoinSubmitted`  | `(txHash: Hex) => void` | Called once the wallet has sent the join, before the receipt. If it throws, the SDK logs a warning. |

They always use the router route. `VaultJoinUnconfirmedError` means the join was mined but the SDK could not match a `Joined` event to every leg.

## Reads

Reads go to the target's or batch's chain, whatever chain the wallet is on. This needs a provider that can read another chain, such as `WagmiProvider`. `ViemProvider` and `EthersProvider` are bound to one chain and throw `ConfigurationError` for another.

### readBatch

`readBatch(batch, account?) => Promise<Batch>`

Reads one batch and the actions that can be sent for it now. Pass `account` to read its deposit and to list `claim` and `quit`.

```ts
const batch = await vaults.readBatch(batchRef, "0xUser");
if (batch.actions.includes("claim")) {
  await vaults.claim(batchRef, "0xUser");
}
```

### readOpenBatches

`readOpenBatches(target, direction) => Promise<OpenBatch[]>`

Reads the open batch of every vault of the target, in group order, on each vault's active batcher.

## Types

### JoinInput

| Field     | Type      | Description                                                                         |
| --------- | --------- | ----------------------------------------------------------------------------------- |
| `vaultId` | `string`  | Group joins only (`GroupJoinInput`): the vault that gets the amount.                 |
| `account` | `Address` | The account that will send the calls.                                               |
| `amount`  | `bigint`  | Plaintext, in base units: the asset for a deposit, shares for a redemption.         |

### JoinOptions

| Field              | Type                   | Default    | Description                                                                         |
| ------------------ | ---------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `route`            | `"router" \| "direct"` | `"router"` | Group joins only (`GroupJoinOptions`). See [How a join is routed](#how-a-join-is-routed). |
| `skipBalanceCheck` | `boolean`              | `false`    | Skips the balance check.                                                            |

### PreparedJoin

Plain data. Its bigints need a replacer to go through `JSON.stringify`, and it holds the chosen vault and amount in cleartext, so store only what you need.

| Field       | Type                    | Description                                                                         |
| ----------- | ----------------------- | ----------------------------------------------------------------------------------- |
| `direction` | `"deposit" \| "redeem"` |                                                                                     |
| `chainId`   | `number`                | The chain to send the calls on.                                                     |
| `groupId`   | `string \| undefined`   | The group joined, or `undefined` for a vault on its own.                            |
| `vaultId`   | `string`                | The vault that gets the amount.                                                     |
| `account`   | `Address`               | The account that must send the calls.                                               |
| `amount`    | `bigint`                | In the asset for a deposit, in shares for a redemption.                             |
| `route`     | `"direct" \| "router"`  |                                                                                     |
| `legs`      | `VaultLeg[]`            | Every vault joined, in group order, the zero legs included.                         |
| `calls`     | `VaultCall[]`           | Every call in send order: the missing operator approvals, then the joins.           |

A `VaultLeg` is `{ vaultId, batcher, token, amount }`: the batcher the leg joins, the token it spends, and its amount, zero for every leg but the chosen one.

### VaultCall

A `Call` (`{ to, data, value: 0n }`) tagged with its `kind`:

| `kind`               | Extra fields                   | Meaning                                                                                       |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| `"operatorApproval"` | `vaultId`, `operator`, `until` | An ERC-7984 approval of `operator` (the router) on the token at `to`, until `until` in chain seconds. |
| `"join"`             | `leg`                          | A join. A router call carries the chosen vault's leg.                                         |

### JoinOutcome

| Field      | Type                                 | Description                                   |
| ---------- | ------------------------------------ | --------------------------------------------- |
| `batches`  | `(BatchRef & { vaultId: string })[]` | The batch each leg landed in, in group order. |
| `txHashes` | `Hex[]`                              | Every transaction sent, approvals first.      |

### BatchRef

`{ chainId: number; batcher: Address; batchId: bigint }`: one batch on one batcher. `BatcherRef` is the same without `batchId`.

### PreparedFinalize

A `BatchRef` plus `unwrapAmountCleartext` (the publicly decrypted amount), `decryptionProof`, and `call`, the `dispatchBatchCallback` call to send.

### Batch

A `BatchRef` plus the fields below. Times are in chain seconds. `Batch` is a union keyed on `state`: narrow on `state` before reading the fields only some states have.

| Field            | Type                                                | Description                                                                         |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `state`          | `"pending" \| "dispatched" \| "finalized" \| "canceled"` |                                                                                |
| `createdAt`      | `bigint`                                            | When the batch opened.                                                              |
| `dispatchableAt` | `bigint`                                            | When anyone may dispatch it.                                                        |
| `dispatchedAt`   | `bigint`                                            | Not `pending`. When it was dispatched.                                              |
| `cancelsAt`      | `bigint`                                            | Not `pending`. The time after which finalizing cancels the batch instead of settling it. |
| `exchangeRate`   | `{ rate: bigint; decimals: number }`                | `finalized` only. A claim pays `deposit * rate / 10 ** decimals`, rounded down.     |
| `paused`         | `boolean`                                           | Whether the batcher is paused. A paused batcher takes no join and no dispatch.      |
| `deposit`        | `EncryptedValue \| null`                            | The account's encrypted deposit, or `null` when no account was given.               |
| `actions`        | `("claim" \| "quit" \| "dispatch" \| "finalize")[]` | What can be sent at `observedAt`.                                                   |
| `observedAt`     | `bigint`                                            | The block timestamp of the read.                                                    |
| `nextChangeAt`   | `bigint \| null`                                    | When `actions` can next change on its own: `dispatchableAt` while pending, `cancelsAt` while dispatched, otherwise `null`. |

When each action is listed:

| Action     | Listed when                                                                      |
| ---------- | -------------------------------------------------------------------------------- |
| `claim`    | The account joined the batch, and the batch is finalized.                        |
| `quit`     | The account joined the batch, and the batch is pending or canceled.              |
| `dispatch` | The batch is pending, the batcher is not paused, and `dispatchableAt` has passed. |
| `finalize` | The batch is dispatched.                                                         |

`claim` and `quit` are listed without decrypting the deposit. A deposit that was paid out reads as an encrypted zero, so they stay listed after the payout. Sending them again moves nothing.

### OpenBatch

A `BatchRef` for the batch the next join lands in, plus:

| Field            | Type      | Description                                                         |
| ---------------- | --------- | ------------------------------------------------------------------- |
| `vaultId`        | `string`  |                                                                     |
| `dispatchableAt` | `bigint`  | When anyone may dispatch the batch, in chain seconds.               |
| `paused`         | `boolean` | Whether the batcher is paused. One paused batcher blocks every join of its group. |
| `observedAt`     | `bigint`  | The block timestamp of the read.                                    |

## TanStack Query

The `vaults` subpath exports framework-agnostic query and mutation options over the client. The [React hooks](../react/README.md) are built on them.

| Export                                                                                           | Wraps                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `batchQueryOptions(client, { batch?, account?, query? })`                                        | `readBatch`. Refetches when `nextChangeAt` passes, and polls while the batch waits for a keeper. Disabled until `batch` is set. |
| `openBatchesQueryOptions(client, { group \| vault, direction, query? })`                         | `readOpenBatches`. Does not refetch on its own.                                                                   |
| `depositMutationOptions(client)`, `redeemMutationOptions(client)`                                | `deposit`, `redeem`. Variables are `{ group, vaultId }` or `{ vault }`, plus `amount` and the send options.        |
| `claimMutationOptions(client)`, `quitMutationOptions(client)`, `finalizeMutationOptions(client)` | `claim`, `quit`, `finalize`. Variables are a `BatchRef`, plus an optional `account` for a claim.                   |
| `dispatchMutationOptions(client)`                                                                | `dispatch`. Variables are a `BatcherRef`.                                                                          |

The mutation options invalidate nothing. Call `invalidateAfterVaultAction(queryClient)` when a mutation settles, as the React hooks do, or after you send prepared calls yourself. It invalidates every vault read and every confidential balance. For the keys, see [`vaultQueryKeys`](../react/query-keys.md#vaultquerykeys).

## Related

- [Vaults overview](../../guides/vaults/README.md)
- [Vault deposits and redemptions](../../guides/vaults/deposits.md)
- [Errors](errors.md#vaultbatcherpausederror): the vault errors
