---
title: VaultClient
description: Deposit into and redeem from confidential ERC-4626 vaults with defineVaultGroup and createVaultClient.
---

# VaultClient

`VaultClient` is the interface for confidential ERC-4626 vaults. You describe each group of vaults once with `defineVaultGroup`, and create one client per SDK instance with `createVaultClient`. The client holds no config: every method takes the group or the batch it acts on, so one client serves every chain and every group.

The client has two kinds of methods:

- A **`prepare*` method** returns the calls as plain data, for a host that sends transactions through its own pipeline.
- A **send method** of the same verb (`deposit`, `redeem`, `claim`, `quit`, `dispatch`, `finalize`) sends them with the SDK's signer.

Every join sends a leg to every vault of its group: the chosen vault gets the amount, and the others get an encrypted zero. This is what hides the choice. Batch actions (claim, quit, dispatch, finalize) act on one batch each. A single vault from [`defineVault`](#definevault) joins as a group of one.

## Import

```ts
import {
  createVaultClient,
  defineVault,
  defineVaultGroup,
  VaultClient,
} from "@zama-fhe/sdk/vaults";
```

The `vaults` subpath is separate from the root entry, so apps that do not use vaults do not bundle it.

## defineVaultGroup

`defineVaultGroup(config)` checks one group of vaults that take deposits in the same confidential asset, and returns a `VaultGroup`. It keeps the group and vault ids as literal types, so a typo in `vaultId` passed to a client method is a type error. The React mutation hooks take `vaultId` as a plain `string`. It reads nothing from chain. Call it once per group, at module level:

```ts
import { defineVaultGroup } from "@zama-fhe/sdk/vaults";

export const STABLE = defineVaultGroup({
  id: "stable",
  chainId: 1,
  asset: "0xConfidentialUSDC",
  vaults: [
    {
      id: "alpha",
      batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" },
      share: "0xAlphaShare",
    },
    {
      id: "beta",
      batchers: { deposit: "0xBetaDeposit", redeem: "0xBetaRedeem" },
      share: "0xBetaShare",
    },
  ],
});
```

Replace the placeholder addresses with your own. The SDK ships no vault group.

### VaultGroupConfig

```ts
import { type VaultGroupConfig } from "@zama-fhe/sdk/vaults";
```

| Field     | Type            | Required | Description                                                                                                                              |
| --------- | --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | `string`        | yes      | Names the group in errors and query keys.                                                                                                |
| `chainId` | `number`        | yes      | The chain every batcher of the group is on. Reads go to this chain, whatever chain the wallet is on.                                     |
| `asset`   | `Address`       | yes      | The confidential token every deposit batcher of the group takes.                                                                         |
| `router`  | `Address`       | no       | The multi-vault router. Defaults to the chain preset's `vaultRouterAddress`. When the preset has one, this must match it.                |
| `vaults`  | `VaultConfig[]` | yes      | The vaults, in leg order. From one vault up to `MAX_GROUP_VAULTS`. Never reorder, add or remove vaults once users have joined the group. |

### VaultConfig

| Field      | Type                                                                        | Required | Description                                                           |
| ---------- | --------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| `id`       | `string`                                                                    | yes      | What callers pass as `vaultId`.                                       |
| `batchers` | `{ deposit: Address \| BatcherHistory; redeem: Address \| BatcherHistory }` | yes      | The batcher a deposit joins, and the batcher a redemption joins.      |
| `share`    | `Address`                                                                   | yes      | The vault's confidential share token, which its redeem batchers take. |

Use a plain address until a batcher is upgraded. After an upgrade, use a `BatcherHistory`.

### VaultGroup

What `defineVaultGroup` returns. It has the same fields as the config, with every address checksummed, `router` set to `undefined` when you left it out, and each batcher turned into a `BatcherHistory`. Only `defineVaultGroup` can make one. `VaultIdOf<typeof STABLE>` is the union of the group's vault ids.

### BatcherHistory

```ts
import { type BatcherHistory } from "@zama-fhe/sdk/vaults";
```

Every batcher a vault has had in one direction.

| Field     | Type                                          | Description                                                                                              |
| --------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `retired` | `{ address: Address; lastBatchId: bigint }[]` | The replaced batchers, oldest first. `lastBatchId` is the last batch a join may land in on that batcher. |
| `latest`  | `Address`                                     | The current batcher.                                                                                     |

A join goes to the first retired batcher whose on-chain `currentBatchId` is still at most its `lastBatchId`, and otherwise to `latest`. The switch happens when batch `lastBatchId` is dispatched, never at a time on the clock. The client reads this on every join, so it needs no restart.

```ts
import { defineVaultGroup } from "@zama-fhe/sdk/vaults";

export const STABLE = defineVaultGroup({
  id: "stable",
  chainId: 1,
  asset: "0xConfidentialUSDC",
  vaults: [
    {
      id: "alpha",
      batchers: {
        deposit: {
          retired: [{ address: "0xAlphaDepositV1", lastBatchId: 41n }],
          latest: "0xAlphaDepositV2",
        },
        redeem: "0xAlphaRedeem",
      },
      share: "0xAlphaShare",
    },
    {
      id: "beta",
      batchers: { deposit: "0xBetaDeposit", redeem: "0xBetaRedeem" },
      share: "0xBetaShare",
    },
  ],
});
```

{% hint style="warning" %}
Never remove a retired entry. Batches on a retired batcher can still be read, claimed and quit.
{% endhint %}

`batcherAddresses(history)` returns every batcher of a history, oldest first. See [Upgrade a batcher](../../guides/vaults/advanced.md#upgrade-a-batcher).

**Throws:** `ConfigurationError` when `chainId` is not a positive integer, an address is invalid, a `lastBatchId` is not a non-negative `bigint`, the group names no vault or more than `MAX_GROUP_VAULTS`, a vault id repeats, or the same batcher appears twice anywhere in the group, retired batchers included.

### MAX_GROUP_VAULTS

`number`

The most vaults a group may hold. A join's FHE compute grows with its number of legs, and this is what fits in one transaction.

## defineVault

`defineVault(config)` checks one vault on its own and returns a `Vault`. It takes the fields of one entry of `vaults`, plus `chainId` and `asset`, and keeps the id as a literal type. Every client method that takes a group also takes a `Vault`, and a join into it needs no `vaultId`:

```ts
import { defineVault } from "@zama-fhe/sdk/vaults";

export const MAIN = defineVault({
  id: "main",
  chainId: 1,
  asset: "0xConfidentialUSDC",
  batchers: { deposit: "0xMainDeposit", redeem: "0xMainRedeem" },
  share: "0xMainShare",
});

await vaults.deposit(MAIN, { amount: 1_000_000n });
```

A single vault joins its batcher directly, like a group of one. **Throws:** as [`defineVaultGroup`](#definevaultgroup).

## createVaultClient

`createVaultClient(sdk)` creates a client bound to a [`ZamaSDK`](ZamaSDK.md) instance. It reads nothing until first use.

```ts
import { createVaultClient } from "@zama-fhe/sdk/vaults";

const vaults = createVaultClient(sdk);
```

In React, use [`useVaultClient`](../react/useVaultClient.md), which returns the same client for as long as the SDK in context stays.

### sdk

`ZamaSDK`

The SDK the client reads, encrypts and sends through.

## Prepare a join

`prepareDeposit` and `prepareRedeem` read the chain and encrypt, and stop before sending. They need no signer. They return a [`PreparedJoin`](#preparedjoin): plain data, safe to store and send through any pipeline (a transaction queue, a bundler, a custody service, or an EIP-5792 `wallet_sendCalls` batch).

```ts
import { createVaultClient } from "@zama-fhe/sdk/vaults";
import { STABLE } from "./vaults";

const vaults = createVaultClient(sdk);

const prepared = await vaults.prepareDeposit(STABLE, {
  vaultId: "beta",
  account: "0xUser",
  amount: 1_000_000n,
});

for (const call of prepared.calls) {
  await sendTransaction(call);
}
```

`sendTransaction` stands in for your own pipeline. Send each call to `call.to` with `call.data` and no value. Send the calls in order: the grants come first.

After you send, call [`invalidateAfterVaultAction`](#invalidateaftervaultaction) to refresh cached reads.

### prepareDeposit

`prepareDeposit(target, input, options?) => Promise<PreparedJoin>`

Builds a deposit of the group's asset into one vault: a leg for every vault, each amount encrypted, and the calls in send order. A deposit pushes the asset, so it needs no grant.

| Parameter | Type                          | Description                              |
| --------- | ----------------------------- | ---------------------------------------- |
| `target`  | `VaultGroup \| Vault`         | The group, or the single vault, to join. |
| `input`   | [`JoinInput`](#joininput)     | The vault, account and amount.           |
| `options` | [`JoinOptions`](#joinoptions) | How the wallet sends, and checks to run. |

**Throws:**

- `ChainMismatchError` when the provider is not on the group's chain while a wallet is connected.
- `ConfigurationError` when the vault is unknown, the join goes through the router and none is configured, or the provider is not on the group's chain with no wallet connected.
- `VaultBatcherPausedError` when any vault's batcher is paused.
- `InsufficientConfidentialBalanceError` when `checks` names `"balance"` and the balance is less than `amount`.
- `BalanceCheckUnavailableError` when `checks` names `"balance"` and the balance cannot be decrypted.

### prepareRedeem

`prepareRedeem(target, input, options?) => Promise<PreparedJoin>`

Builds a redemption of one vault's shares. The amount is in shares, not assets. On the router route, the router pulls every leg's share token, so `grants` holds an operator grant on each share token the account has not granted to the router yet. Throws as `prepareDeposit`.

### activeBatchers

`activeBatchers(target, direction) => Promise<ActiveBatchers>`

Reads the batcher a join in `direction` (`"deposit"` or `"redeem"`) reaches right now on each vault of the group. Returns a record keyed by vault id. Use it when your own code needs the batcher a join will land on, for example to watch its `Joined` events.

### How a join is routed

`route` in the prepared join tells you how the calls reach the batchers. It depends on the group's size and the wallet mode:

| Case                                    | `route`    | `calls`                                                                                                 |
| --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| Group of one                            | `"legs"`   | One transfer to the batcher.                                                                            |
| Several vaults, deposit, `"sequential"` | `"router"` | One transfer of the asset to the router, which splits it into one leg per vault. No grant.              |
| Several vaults, redeem, `"sequential"`  | `"router"` | A grant to the router on each share token the account lacks, then one router call that pulls every leg. |
| Several vaults, `"bundle"`              | `"legs"`   | One transfer per vault, straight to its batcher. No grant.                                              |

{% hint style="danger" %}
With `route: "legs"` in a group of more than one, send the join calls as one atomic bundle. If they go out one by one and the user stops partway, the vaults that were never joined show which vault the user picked.
{% endhint %}

### Why a grant lasts a year

A grant is valid for a year of chain time. This is safe: the router only pulls a share token for a join that its holder sends, under an encryption proof bound to that holder. Nobody else can use the grant to move the shares. A long grant spares the user a wallet prompt on every later redemption.

## Prepare a batch action

Each batch action acts on one batch. A batch is identified by its batcher, not its vault, because batchers can be upgraded. See [`BatchRef`](#batchref).

### prepareClaim

`prepareClaim({ chainId, batcher, batchId, account }) => Call`

Claims a finalized batch's output for `account`. Anyone may send it, and the output always goes to `account`. So a keeper or your backend can claim for users.

### prepareQuit

`prepareQuit({ chainId, batcher, batchId }) => Call`

Takes the sender's deposit back from a pending batch, or from a canceled one. The contract refunds the sender, so only the depositor may send it.

### prepareDispatch

`prepareDispatch({ chainId, batcher }) => Call`

Closes the batcher's open batch and starts its decryption. Anyone may send it. It reverts while the batch is too young or the batcher is paused. A keeper (an off-chain service that watches batches) normally sends it.

### prepareFinalize

`prepareFinalize(batchRef) => Promise<PreparedFinalize>`

Builds the settlement of a dispatched batch. It reads the batch's unwrap request, decrypts the amount publicly, and returns the call with the decryption proof. Anyone may send it. Past the batch's callback deadline (`Batch.cancelsAt`), the same call cancels the batch instead of settling it.

**Throws:**

- `VaultBatchNotDispatchedError` when the batch is not dispatched. The error carries the batch's `state`.
- `ChainMismatchError` when the provider is not on the batch's chain while a wallet is connected.
- `ConfigurationError` when the provider is not on the batch's chain with no wallet connected. Finalizing decrypts on the provider's chain.

`prepareClaim`, `prepareQuit` and `prepareDispatch` are synchronous and read nothing. A batch can change state before your pipeline sends the call, so read it with [`readBatch`](#readbatch) right before you send.

## Send methods

The send methods sign with the SDK's signer and wait for each receipt. A join sends one transaction per call, grants first, so each call is one wallet prompt. The SDK sends one call at a time, so it always prepares a join with `walletMode: "sequential"`.

All send methods throw:

- `SignerNotConfiguredError` when the SDK has no signer.
- `ChainMismatchError` when the wallet is not on the group's or batch's chain.

### deposit

`deposit(group, input, options?) => Promise<JoinOutcome>`

Deposits with the SDK's signer: it prepares the join for the signer's account, sends the calls, and reads from the receipt the batch each leg landed in.

```ts
const { batches, txHashes } = await vaults.deposit(STABLE, { vaultId: "beta", amount: 1_000_000n });
```

The amount is in the asset's base units, so `1_000_000n` is one unit of a 6-decimal token.

| Parameter                 | Type                       | Description                                                                                                                                                |
| ------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`                  | `VaultGroup \| Vault`      | The group, or the single vault, to join.                                                                                                                   |
| `input.vaultId`           | `VaultIdOf<typeof target>` | The vault that gets the amount. Optional for a single vault.                                                                                               |
| `input.amount`            | `bigint`                   | Plaintext, in base units. Encrypted before it leaves the SDK.                                                                                              |
| `options.skipChecks`      | `"balance"[]`              | Optional. `"balance"` skips the balance check, which runs by default. The paused check is never skipped.                                                   |
| `options.onJoinSubmitted` | `(txHash: Hex) => void`    | Optional. Called with the join's transaction hash once the wallet has sent it, before the SDK waits for the receipt. If it throws, the SDK logs a warning. |

**Throws:** as [`prepareDeposit`](#preparedeposit), and `VaultJoinUnconfirmedError` when the join is mined but the receipt does not confirm every leg.

### redeem

`redeem(group, input, options?) => Promise<JoinOutcome>`

Redeems a vault's shares with the SDK's signer. Same parameters as `deposit`. The amount is in shares.

```ts
const { batches } = await vaults.redeem(STABLE, { vaultId: "beta", amount: 500n });
```

{% hint style="warning" %}
**A first redemption from a group of N vaults can ask for up to N + 1 wallet prompts.** The router pulls each vault's share token, so the account first grants it an operator approval on every share token it has not granted yet, then sends the join. Later redemptions ask for no grant for a year. Tell users before they start.
{% endhint %}

### claim

`claim({ chainId, batcher, batchId, account? }) => Promise<TransactionResult>`

Claims a finalized batch for `account`, which defaults to the signer. The output goes to `account`, whoever sends it. A keeper normally claims for every depositor.

### quit

`quit({ chainId, batcher, batchId }) => Promise<TransactionResult>`

Takes the signer's deposit back from a pending or canceled batch. The signer must be the depositor.

### dispatch

`dispatch({ chainId, batcher }) => Promise<TransactionResult>`

Dispatches the batcher's open batch. A keeper normally does.

### finalize

`finalize(batchRef) => Promise<TransactionResult>`

Settles a dispatched batch with its publicly decrypted amount. A keeper normally does. Throws as [`prepareFinalize`](#preparefinalize).

## Reads

Reads go to the group's or batch's chain, whatever chain the wallet is on. This needs a provider that can read another chain, such as `WagmiProvider`. `ViemProvider` and `EthersProvider` are bound to one chain and throw `ConfigurationError` for another.

### readBatch

`readBatch({ chainId, batcher, batchId, account? }) => Promise<Batch>`

Reads one batch's state and timings in one round of reads, and works out what can be sent for it now. Pass `account` to read its encrypted deposit and to list `claim` and `quit`.

```ts
const batch = await vaults.readBatch({ ...ref, account: "0xUser" });
if (batch.actions.includes("claim")) {
  await vaults.claim({ ...ref, account: "0xUser" });
}
```

See [`Batch`](#batch).

### readOpenBatches

`readOpenBatches(target, direction) => Promise<OpenBatch[]>`

Reads the open batch of every vault of a group, through each vault's active batcher. Use it on a form to show when the next batch closes, or that a vault is paused.

```ts
const batches = await vaults.readOpenBatches(STABLE, "deposit");
for (const batch of batches) {
  console.log(batch.vaultId, batch.dispatchableAt, batch.paused);
}
```

## Types

### JoinInput

What `prepareDeposit` and `prepareRedeem` take. `deposit` and `redeem` take the same fields without `account`.

| Field     | Type      | Description                                                                                  |
| --------- | --------- | -------------------------------------------------------------------------------------------- |
| `vaultId` | `string`  | The vault that gets the amount. Typed to the group's vault ids. Optional for a single vault. |
| `account` | `Address` | The account the calls come from.                                                             |
| `amount`  | `bigint`  | Plaintext, in base units. Encrypted before it leaves the SDK. For a redemption, in shares.   |

### JoinOptions

Options for `prepareDeposit` and `prepareRedeem`.

| Field        | Type                       | Default        | Description                                                                                                                                                                                                                                                                                   |
| ------------ | -------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `walletMode` | `"sequential" \| "bundle"` | `"sequential"` | How the sender's wallet lands several calls. `"sequential"` sends them one at a time, so a multi-vault join goes through the router. `"bundle"` lands them together or not at all (EIP-5792, a Safe, a smart account), so a multi-vault join sends one transfer per vault and needs no grant. |
| `checks`     | `"balance"[]`              | `[]`           | `"balance"` checks the balance before encrypting. The paused check always runs.                                                                                                                                                                                                               |

The balance check decrypts as the signer, so it works only when `account` is the signer's. It decrypts the balance of every token the legs spend, not only the chosen one, so the relayer cannot tell which vault you picked.

### PreparedJoin

What `prepareDeposit` and `prepareRedeem` return. Plain data, safe to store.

| Field     | Type                    | Description                                                                          |
| --------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `kind`    | `"deposit" \| "redeem"` | Whether it deposits or redeems.                                                      |
| `chainId` | `number`                | The chain to send the calls on.                                                      |
| `groupId` | `string`                | The group joined, or the single vault's id.                                          |
| `vaultId` | `string`                | The vault that gets the amount.                                                      |
| `account` | `Address`               | The account the calls come from.                                                     |
| `amount`  | `bigint`                | The amount: in the asset for a deposit, in shares for a redemption.                  |
| `route`   | `"legs" \| "router"`    | How the calls reach the batchers. See [How a join is routed](#how-a-join-is-routed). |
| `legs`    | `VaultLeg[]`            | Every vault of the group, in group order, decoys included.                           |
| `grants`  | `GrantCall[]`           | The grants the account lacks, in leg order. Send them before the joins.              |
| `joins`   | `JoinCall[]`            | The join calls. With `route: "legs"` in a group of more than one, bundle them.       |
| `calls`   | `VaultCall[]`           | `grants`, then `joins`: every call in send order.                                    |

Each `VaultLeg` is `{ vaultId, batcher, token, amount }`: the vault, the batcher the leg joins (resolved when the join was prepared), the token it spends, and its amount (zero for every vault but the chosen one).

### VaultCall

A `Call` (`{ to: Address; data: Hex; value: 0n }`) tagged with its `role`, so you can tell grants from joins without decoding the calldata:

| `role`    | Extra fields                            | Meaning                                                                                                            |
| --------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `"grant"` | `vaultId`, `token`, `operator`, `until` | An ERC-7984 operator grant the join relies on: `operator` (the router) on `token`, until `until` in chain seconds. |
| `"join"`  | `leg`                                   | A join call, with the leg it funds. A router call carries the chosen leg.                                          |

### JoinOutcome

What `deposit` and `redeem` return.

| Field      | Type                                 | Description                                   |
| ---------- | ------------------------------------ | --------------------------------------------- |
| `prepared` | `PreparedJoin`                       | What was sent.                                |
| `batches`  | `(BatchRef & { vaultId: string })[]` | The batch each leg landed in, in group order. |
| `txHashes` | `Hex[]`                              | Every transaction sent, grants first.         |

### BatchRef

`{ chainId: number; batcher: Address; batchId: bigint }`. One batch on one batcher. Store the `batches` of a `JoinOutcome` to read, claim or quit them later.

### PreparedFinalize

A `BatchRef` plus `unwrapAmountCleartext` (the publicly decrypted amount), `decryptionProof` (which the batcher verifies) and `call` (the `dispatchBatchCallback` call to send).

### Batch

One batch as read from chain, with its `BatchRef` fields. Timestamps are chain seconds. `Batch` is a union keyed on `state`: check `state` before you read a field that only some states have.

| Field            | Type                                                | Description                                                                                                                                   |
| ---------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`          | `BatchState`                                        | `"pending"`, `"dispatched"`, `"finalized"` or `"canceled"`.                                                                                   |
| `createdAt`      | `bigint`                                            | When the batch opened.                                                                                                                        |
| `dispatchableAt` | `bigint`                                            | When anyone may dispatch it.                                                                                                                  |
| `dispatchedAt`   | `bigint`                                            | Every state but `pending`. When it was dispatched.                                                                                            |
| `cancelsAt`      | `bigint`                                            | Every state but `pending`. From this time, finalizing cancels the batch instead of settling it.                                               |
| `exchangeRate`   | `{ rate: bigint; decimals: number }`                | `finalized` only. A claim pays `deposit * rate / 10 ** decimals`, rounded down.                                                               |
| `paused`         | `boolean`                                           | Whether the batcher is paused. A paused batcher takes no join and no dispatch.                                                                |
| `deposit`        | `EncryptedValue \| null`                            | The account's encrypted deposit in the batch, when the read named an account. A claim or quit leaves an encrypted zero.                       |
| `actions`        | `("claim" \| "quit" \| "dispatch" \| "finalize")[]` | What can be sent now. Without an account, only `dispatch` and `finalize` are listed.                                                          |
| `observedAt`     | `bigint`                                            | The block timestamp the read was made at.                                                                                                     |
| `nextChangeAt`   | `bigint \| null`                                    | The next chain time at which `actions` can change on its own: `dispatchableAt` while pending, `cancelsAt` while dispatched. `null` otherwise. |

When each action is listed:

| Action     | Listed when                                                                       | Who sends it                    |
| ---------- | --------------------------------------------------------------------------------- | ------------------------------- |
| `claim`    | The account joined the batch, and the batch is finalized.                         | Anyone; a keeper normally does. |
| `quit`     | The account joined the batch, and the batch is pending or canceled.               | The depositor only.             |
| `dispatch` | The batch is pending, the batcher is not paused, and `dispatchableAt` has passed. | Anyone; a keeper normally does. |
| `finalize` | The batch is dispatched.                                                          | Anyone; a keeper normally does. |

`claim` and `quit` are listed from the deposit's encrypted value, without decrypting it. After a claim or quit, the deposit is an encrypted zero that the SDK cannot tell from a non-zero one, so the action stays listed. Sending it again moves nothing.

### OpenBatch

| Field            | Type      | Description                                                                                            |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `vaultId`        | `string`  | The vault.                                                                                             |
| `chainId`        | `number`  | The group's chain.                                                                                     |
| `batcher`        | `Address` | The batcher the next join reaches: a retired one until its `lastBatchId` is dispatched, then `latest`. |
| `batchId`        | `bigint`  | The open batch, which the next join lands in.                                                          |
| `dispatchableAt` | `bigint`  | When anyone may dispatch the batch, in chain seconds.                                                  |
| `paused`         | `boolean` | A paused batcher takes no join and no dispatch.                                                        |
| `observedAt`     | `bigint`  | The block timestamp the read was made at.                                                              |

## TanStack Query

The `vaults` subpath also exports framework-agnostic query and mutation options over the client. The [React hooks](../react/README.md) are built on them.

| Export                                                                                           | Wraps                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `batchQueryOptions(client, { batch?, account?, query? })`                                        | `readBatch`. Refetches when `nextChangeAt` passes and polls while the batch waits for a dispatch or a settlement. Disabled until `batch` is set. |
| `openBatchesQueryOptions(client, { group \| vault, direction, query? })`                         | `readOpenBatches`                                                                                                                                |
| `depositMutationOptions(client)`, `redeemMutationOptions(client)`                                | `deposit`, `redeem`. Variables are `{ group, vaultId }` or `{ vault }`, plus `{ amount, skipChecks?, onJoinSubmitted? }`.                        |
| `claimMutationOptions(client)`, `quitMutationOptions(client)`, `finalizeMutationOptions(client)` | `claim`, `quit`, `finalize`. Variables are a `BatchRef`, plus an optional `account` for a claim.                                                 |
| `dispatchMutationOptions(client)`                                                                | `dispatch`. Variables are `{ chainId, batcher }`.                                                                                                |

The mutation options do not invalidate anything by themselves. Call `invalidateAfterVaultAction` in `onSuccess`, as the React hooks do. For the query keys, see [`vaultQueryKeys`](../react/query-keys.md#vaultquerykeys).

### invalidateAfterVaultAction

`invalidateAfterVaultAction(queryClient) => void`

Invalidates every vault read and every confidential balance. Call it after you send prepared calls yourself:

```ts
import { invalidateAfterVaultAction } from "@zama-fhe/sdk/vaults";

invalidateAfterVaultAction(queryClient);
```

## Related

- [Vaults overview](../../guides/vaults/README.md)
- [Vault deposits and redemptions](../../guides/vaults/deposits.md)
- [Advanced vault integration](../../guides/vaults/advanced.md)
- [Building a vault UI](../../guides/vaults/building-a-ui.md)
- [Errors](errors.md#vaultbatchnotdispatchederror) — the vault errors
