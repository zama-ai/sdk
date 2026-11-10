---
title: VaultClient
description: Deposit into and redeem from confidential ERC-4626 vaults with defineVaults and createVaultClient.
---

# VaultClient

`VaultClient` is the interface for confidential ERC-4626 vaults. You describe your vaults once with `defineVaults`, then bind that config to an SDK instance with `createVaultClient`. One client serves every vault in the config.

Every action has two methods:

- A **`prepare*` method** returns the calls as plain data, for a host that sends transactions through its own pipeline.
- A **send method** of the same verb (`deposit`, `redeem`, `exit`, `dispatch`, `finalize`) sends them with the SDK's signer.

Every join sends a leg to every vault of its group: the chosen vault gets the amount, the others get an encrypted zero. Every exit covers every leg. The client cannot act on part of a join, because acting on one leg alone would reveal the chosen vault. A single vault is a group of one.

## Import

```ts
import { createVaultClient, defineVaults, VaultClient } from "@zama-fhe/sdk/vaults";
```

The `vaults` subpath is separate from the root entry, so apps that do not use vaults do not bundle it.

## defineVaults

`defineVaults(config)` checks a config and returns it unchanged, with its group and vault ids kept as literal types. It reads nothing from chain. Call it once, at module level, so the config keeps its identity across renders:

```ts
import { defineVaults } from "@zama-fhe/sdk/vaults";

export const VAULTS = defineVaults({
  chainId: 1,
  groups: {
    stable: {
      asset: "0xConfidentialUSDC",
      vaults: {
        alpha: { depositBatcher: "0xAlphaDeposit", redeemBatcher: "0xAlphaRedeem" },
        beta: { depositBatcher: "0xBetaDeposit", redeemBatcher: "0xBetaRedeem" },
      },
    },
    solo: {
      asset: "0xConfidentialUSDC2",
      vaults: { main: { depositBatcher: "0xMainDeposit", redeemBatcher: "0xMainRedeem" } },
    },
  },
});
```

Replace the placeholder addresses with your own. The SDK ships no vault config.

### VaultsConfig

```ts
import { type VaultsConfig } from "@zama-fhe/sdk/vaults";
```

| Field     | Type                               | Required | Description                                                                                                                                                        |
| --------- | ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chainId` | `number`                           | yes      | The chain every batcher is on. Reads go to this chain, whatever chain the wallet is on.                                                                            |
| `router`  | `Address`                          | no       | The multi-vault router. Defaults to the chain preset's `vaultRouterAddress`. When the preset has one, this must match it. Only a multi-vault join uses the router. |
| `groups`  | `Record<string, VaultGroupConfig>` | yes      | The groups, keyed by id.                                                                                                                                           |

### VaultGroupConfig

| Field    | Type                          | Required | Description                                                                                                                     |
| -------- | ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `asset`  | `Address`                     | yes      | The confidential token every vault of the group takes deposits in.                                                              |
| `vaults` | `Record<string, VaultConfig>` | yes      | The vaults, keyed by id. Key order is the leg order of every join, so never reorder, add or remove keys once users have joined. |

### VaultConfig

| Field            | Type                        | Required | Description                                           |
| ---------------- | --------------------------- | -------- | ----------------------------------------------------- |
| `depositBatcher` | `Address \| BatcherHistory` | yes      | The batcher a deposit of the group's asset joins.     |
| `redeemBatcher`  | `Address \| BatcherHistory` | yes      | The batcher a redemption of the vault's shares joins. |

Use a plain address until a vault's batcher is upgraded. After an upgrade, use a `BatcherHistory`.

### BatcherHistory

```ts
import { type BatcherHistory } from "@zama-fhe/sdk/vaults";
```

Every batcher a vault has had in one direction.

| Field     | Type                                          | Description                                                                                              |
| --------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `retired` | `{ address: Address; lastBatchId: bigint }[]` | The replaced batchers, oldest first. `lastBatchId` is the last batch a join may land in on that batcher. |
| `latest`  | `Address`                                     | The current batcher.                                                                                     |

A join goes to the first retired batcher whose on-chain `currentBatchId` is still at most its `lastBatchId`, and otherwise to `latest`. The switch happens when the batch `lastBatchId` is dispatched, never at a time on the clock. The client reads this on every join, so it needs no restart.

```ts
import { defineVaults } from "@zama-fhe/sdk/vaults";

export const VAULTS = defineVaults({
  chainId: 1,
  groups: {
    stable: {
      asset: "0xConfidentialUSDC",
      vaults: {
        alpha: {
          depositBatcher: {
            retired: [{ address: "0xAlphaDepositV1", lastBatchId: 41n }],
            latest: "0xAlphaDepositV2",
          },
          redeemBatcher: "0xAlphaRedeem",
        },
        beta: { depositBatcher: "0xBetaDeposit", redeemBatcher: "0xBetaRedeem" },
      },
    },
  },
});
```

{% hint style="warning" %}
Never remove a retired entry. Join records keep the batcher each leg actually joined, and the client only accepts a record whose batchers are in the config. A position on a retired batcher can still be read and exited as long as its entry stays.
{% endhint %}

See [Upgrade a batcher](../../guides/vaults/groups.md#upgrade-a-batcher).

**Throws:** `ConfigurationError` when `chainId` is not a positive integer, an address is invalid, a `lastBatchId` is not a non-negative `bigint`, a group names no vault or more than `MAX_GROUP_VAULTS`, or the same batcher appears twice anywhere in the config, retired batchers included.

### MAX_GROUP_VAULTS

`number`

The most vaults a group may name. It matches the router's per-transaction leg limit.

## createVaultClient

`createVaultClient(sdk, config)` binds a `defineVaults` config to a [`ZamaSDK`](ZamaSDK.md) instance. It reads nothing until first use.

```ts
import { createVaultClient } from "@zama-fhe/sdk/vaults";
import { VAULTS } from "./vaults";

const client = createVaultClient(sdk, VAULTS);
```

On the first join of each group, the client checks the config against the chain once: each vault's deposit batchers take the group's asset, its redeem batchers pay it out, every batcher of the vault (retired ones included) trades the same share token against the same ERC-4626 vault, and no two vaults of a group point at the same ERC-4626 vault. A mismatch throws `ConfigurationError` before anything is encrypted or sent.

In React, use [`useVaultClient`](../react/useVaultClient.md), which memoizes the client per SDK and config.

## Properties

### sdk

`ZamaSDK`

The SDK the client reads, encrypts and sends through.

### config

`TConfig`

The config the client was created with.

### chainId

`number`

The chain every batcher is on. Same as `config.chainId`.

## Send methods

The send methods sign with the SDK's signer and wait for each receipt. They send one transaction per call, grants first, so each call is one wallet prompt.

All send methods throw:

- `SignerNotConfiguredError` when the SDK has no signer.
- `ChainMismatchError` when the wallet is not on the config's chain.
- `ConfigurationError` when the action must come from a given account and the signer is another one.

### deposit

`deposit(params, options?) => Promise<JoinOutcome>`

Deposits the group's asset. The SDK checks the balance, encrypts the amount, sends the join, and reads every leg's batch id back from the receipt.

```ts
const { record, txHashes } = await client.deposit({
  groupId: "stable",
  vaultId: "beta",
  amount: 1_000_000n,
});
await saveRecord(record);
```

The amount is in the asset's base units, so `1_000_000n` is one unit of a 6-decimal token. Store the returned `record`: you need it to read and exit the position later. See [Store the join record](../../guides/vaults/deposits.md#4-store-the-join-record).

| Group size                    | Wallet prompts | What the SDK sends                                                                                            |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| One vault                     | 1              | A transfer of the asset to the deposit batcher.                                                               |
| One vault, with `beneficiary` | up to 2        | An operator grant to the batcher if the account lacks one, then the batcher's `join`, which pulls the amount. |
| Several vaults                | 1              | One transfer of the asset to the router, which splits it into one leg per vault.                              |

### redeem

`redeem(params, options?) => Promise<JoinOutcome>`

Redeems a vault's shares. The amount is in shares, not assets. Same flow as `deposit`, on the redeem batchers.

```ts
const { record } = await client.redeem({ groupId: "stable", vaultId: "beta", amount: 500n });
```

| Group size                    | Wallet prompts  | What the SDK sends                                                                                                                        |
| ----------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| One vault                     | 1               | A transfer of the share token to the redeem batcher.                                                                                      |
| One vault, with `beneficiary` | up to 2         | An operator grant to the batcher if the account lacks one, then the batcher's `join`.                                                     |
| N vaults                      | **up to N + 1** | One operator grant to the router per share token the account has not granted yet, then the router's join, which pulls every leg's shares. |

{% hint style="warning" %}
**A redemption from a group of N vaults can ask for up to N + 1 wallet prompts.** Each vault has its own share token, and the router pulls every one of them, so the account must grant the router an operator approval on each. The first redemption asks for every grant. Later redemptions ask for none while the grants last. Grants last `grantValiditySeconds` (one hour by default), so a redemption after they expire asks for all of them again. Tell users before they start, or pass a longer `grantValiditySeconds`. A wallet that bundles calls atomically avoids the grants: see [Atomic wallets](../../guides/vaults/groups.md#atomic-wallets).
{% endhint %}

### exit

`exit(record) => Promise<ActionOutcome>`

Exits every leg of a join: it quits a pending leg (refund), claims a finalized leg (payout), and recovers a canceled leg (refund). It sends one transaction per leg, so a group of N vaults takes N wallet prompts.

```ts
await client.exit(record);
```

Exits are safe to repeat. An exited leg holds an encrypted zero, so exiting it again moves nothing.

**Throws:** `VaultActionNotAllowedError` with reason `"leg-dispatched"` when a leg is dispatched. Wait for it to settle, or [finalize](#finalize) it.

### dispatch

`dispatch(record) => Promise<ActionOutcome>`

Dispatches the batch of every leg that is pending, old enough, and on an unpaused batcher. Anyone may send it. A keeper (an off-chain service that watches batches) normally does, so most apps never call it.

**Throws:** `VaultActionNotAllowedError` with reason `"nothing-to-dispatch"` when no leg can be dispatched.

### finalize

`finalize(record) => Promise<ActionOutcome>`

Settles the batch of every dispatched leg with its publicly decrypted amount. Anyone may send it. A keeper normally does. Once a batch is past its callback deadline (`Leg.cancelsAt`), the same call cancels the batch instead of settling it, and the leg can then be exited for a refund.

**Throws:**

- `VaultActionNotAllowedError` with reason `"nothing-to-finalize"` when no leg is dispatched.
- `ConfigurationError` when the provider is not on the config's chain. Finalizing decrypts on the provider's chain.

## Prepare methods

The `prepare*` methods run the same checks and encryptions as the send methods and stop before sending. They return a [`PreparedVaultAction`](#preparedvaultaction). Use them when your app sends transactions through its own pipeline: a transaction queue, a bundler, a custody service, or an EIP-5792 `wallet_sendCalls` batch.

```ts
import type { PreparedVaultAction, VaultCall } from "@zama-fhe/sdk/vaults";

async function sendPrepared(prepared: PreparedVaultAction) {
  for (const grant of prepared.grants) await sendTransaction(grant);
  for (const call of prepared.calls) await sendTransaction(call);
}

const prepared = await client.prepareDeposit(
  { groupId: "stable", vaultId: "beta", amount: 1_000_000n },
  { account: "0xUser", skipChecks: ["balance"] },
);
await sendPrepared(prepared);
```

`sendTransaction(call: VaultCall)` stands in for your own pipeline. Send each call to `call.to` with `call.data` and no value.

The prepare methods do not return a join record. A host that sends a join itself builds the record from its own indexer of the batchers' `Joined` events. See [Send through your own pipeline](../../guides/vaults/groups.md#send-through-your-own-pipeline).

After you send a prepared action, call [`invalidateAfterVaultAction`](#invalidateaftervaultaction) to refresh cached reads.

### prepareDeposit

`prepareDeposit(params, options?) => Promise<PreparedVaultAction>`

Builds a deposit. Takes the same `params` as [`deposit`](#deposit) and [`PrepareJoinOptions`](#preparejoinoptions).

**Throws:**

- `ConfigurationError` when the group or vault is unknown, `vaultId` is missing in a group of several vaults, `beneficiary` is given in a group of several vaults, the config does not match the chain, or the provider is not on the config's chain.
- `VaultBatcherPausedError` when any vault's deposit batcher is paused.
- `UnlistedConfidentialTokenError` when a multi-vault deposit goes through the router and the router's registry does not list the asset.
- `InsufficientConfidentialBalanceError` when the balance is less than `amount`.
- `BalanceCheckUnavailableError` when the balance check cannot decrypt the balance.

### prepareRedeem

`prepareRedeem(params, options?) => Promise<PreparedVaultAction>`

Builds a redemption. Throws as `prepareDeposit`, for the redeem batchers. In a multi-vault group sent sequentially, `grants` holds the router grants the account still lacks, one per share token.

### prepareExit

`prepareExit(record) => Promise<PreparedVaultAction>`

Builds the exit of every leg. A pending leg can only be quit by the account that joined, so `sender` is then the account. Otherwise `sender` is `null` and anyone may send it, for example a backend that claims for users.

**Throws:** `VaultActionNotAllowedError` with reason `"leg-dispatched"`.

### prepareDispatch

`prepareDispatch(record) => Promise<PreparedVaultAction>`

Builds the dispatch of every eligible leg's batch. `sender` is `null`.

**Throws:** `VaultActionNotAllowedError` with reason `"nothing-to-dispatch"`.

### prepareFinalize

`prepareFinalize(record) => Promise<PreparedVaultAction>`

Builds the settlement of every dispatched leg's batch, including the public decryption of each batch's amount. `sender` is `null`.

**Throws:** `VaultActionNotAllowedError` with reason `"nothing-to-finalize"`, and `ConfigurationError` when the provider is not on the config's chain.

{% hint style="info" %}
`prepareExit`, `prepareDispatch` and `prepareFinalize` build their calls from the batch states at the time you call them. A batch can change state before your pipeline sends the calls, for example when a keeper dispatches it. Prepare these right before you send them.
{% endhint %}

## Reads

Reads go to the config's chain, whatever chain the wallet is on. This needs a provider that can read another chain, such as `WagmiProvider`. `ViemProvider` and `EthersProvider` are bound to one chain and throw `ConfigurationError` for another.

### readPosition

`readPosition(record, options?) => Promise<Position>`

Reads every leg's batch state, timings and deposit in one round of reads, and works out what can be sent now. See [Position](#position).

```ts
const position = await client.readPosition(record);
if (position.availableActions.includes("exit")) {
  await client.exit(record);
}
```

| Option    | Type      | Default | Description                                                                                                                                                                                                 |
| --------- | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decrypt` | `boolean` | `false` | Decrypt every leg's deposit together, as the signer, to fill `Leg.amount`, `chosenVaultId` and the `closed` phase. Needs a signer and a provider on the config's chain, and may ask for a permit signature. |

{% hint style="warning" %}
**Without `decrypt`, the client cannot tell an exited position apart.** An exit replaces each deposit with an encrypted zero, and the batch state does not change. So an exited position still reads `ready` (or `queued`), and `exit` stays in `availableActions`. Sending it again is harmless, because exits move nothing the second time. Read with `decrypt: true`, or track exits in your own records, to show a position as done.
{% endhint %}

### readOpenBatches

`readOpenBatches(groupId, direction) => Promise<OpenBatch[]>`

Reads the open batch of every vault of a group, for a form that shows when the next batch closes. It needs no join record.

```ts
const batches = await client.readOpenBatches("stable", "deposit");
for (const batch of batches) {
  console.log(batch.vaultId, batch.dispatchableAt, batch.paused);
}
```

`direction` is `"deposit"` or `"redeem"`.

## Types

### VaultJoinParams

What `deposit`, `redeem`, `prepareDeposit` and `prepareRedeem` take. The type depends on the group's size.

| Field         | Type      | Description                                                                                                                                                                                                 |
| ------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groupId`     | `string`  | The group to join. Typed to the config's group ids.                                                                                                                                                         |
| `vaultId`     | `string`  | The vault that gets the amount. Required in a group of several vaults, optional in a group of one.                                                                                                          |
| `amount`      | `bigint`  | Plaintext, in base units. Encrypted before it leaves the SDK. For a redemption, in shares.                                                                                                                  |
| `beneficiary` | `Address` | Only in a group of one. The account the batcher credits, when it is not the sender. The beneficiary owns the position: only they can quit it, and claims pay them. A router join always credits the sender. |

### JoinOptions

Options for `deposit` and `redeem`.

| Field                  | Type                        | Description                                                                                                                                                              |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skipChecks`           | `("balance" \| "config")[]` | Checks to skip. See [`PrepareJoinOptions`](#preparejoinoptions).                                                                                                         |
| `grantValiditySeconds` | `number`                    | How long an operator grant lasts. Defaults to `3600`.                                                                                                                    |
| `onJoinSubmitted`      | `(txHash: Hex) => void`     | Called with the join's transaction hash once the wallet has sent it, before the SDK waits for the receipt. If the callback throws, the SDK logs a warning and continues. |

The send methods always send sequentially. To send an atomic bundle, use a `prepare*` method with `walletMode: "atomic"`.

### PrepareJoinOptions

Options for `prepareDeposit` and `prepareRedeem`.

| Field                  | Type                        | Default        | Description                                                                                                                                                                                                                                   |
| ---------------------- | --------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account`              | `Address`                   | the signer's   | The account the join comes from. Any account other than the signer's needs `skipChecks: ["balance"]`, because the balance check decrypts as the signer.                                                                                       |
| `walletMode`           | `"sequential" \| "atomic"`  | `"sequential"` | `"sequential"` builds one router call in a multi-vault group, for a wallet that sends calls one by one. `"atomic"` builds one transfer per vault and no grants, for a wallet that lands them in one atomic bundle. A group of one ignores it. |
| `skipChecks`           | `("balance" \| "config")[]` | `[]`           | `"balance"` skips the balance check. `"config"` skips the one-time check of the config against the chain and the router's registry listing. The paused check is never skipped.                                                                |
| `grantValiditySeconds` | `number`                    | `3600`         | How long an operator grant lasts, from the chain's current time.                                                                                                                                                                              |

The balance check decrypts the balance of every token the legs spend, not only the chosen one, so the relayer cannot tell which vault you picked. Skip it only when your app already checked the balance, or when the signer cannot decrypt the account's balance (for example a smart wallet).

### PreparedVaultAction

What every `prepare*` method returns. It is plain data, safe to store and send through any pipeline.

| Field       | Type                                                          | Description                                                                                              |
| ----------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `v`         | `1`                                                           | The format version.                                                                                      |
| `kind`      | `"deposit" \| "redeem" \| "exit" \| "dispatch" \| "finalize"` | The method that prepared it.                                                                             |
| `chainId`   | `number`                                                      | The chain to send the calls on.                                                                          |
| `groupId`   | `string`                                                      | The group acted on.                                                                                      |
| `sender`    | `Address \| null`                                             | The account that must send the calls, or `null` when anyone may.                                         |
| `grants`    | `VaultCall[]`                                                 | ERC-7984 operator grants the account lacks. Send them first, in any order. They are idempotent.          |
| `calls`     | `VaultCall[]`                                                 | The action's calls. Always at least one.                                                                 |
| `atomic`    | `boolean`                                                     | `true` when the calls must land in one atomic bundle (an `"atomic"` join).                               |
| `expiresAt` | `bigint \| null`                                              | When the earliest grant expires, in chain seconds. `null` without grants. Prepare again after this time. |

{% hint style="danger" %}
When `atomic` is `true`, send every call in one atomic bundle. If the calls are sent one by one and the user stops partway, the vaults that were never joined show which vault the user picked.
{% endhint %}

### VaultCall

`{ to: Address; data: Hex }`. A call ready for any transaction pipeline. Send it with no value.

### JoinOutcome

What `deposit` and `redeem` return.

| Field      | Type         | Description                                   |
| ---------- | ------------ | --------------------------------------------- |
| `record`   | `JoinRecord` | Store it to read and exit the position later. |
| `txHashes` | `Hex[]`      | Every transaction sent, grants first.         |

### ActionOutcome

What `exit`, `dispatch` and `finalize` return: `{ txHashes: Hex[] }`, every transaction sent, in order.

### JoinRecord

Every leg of one join, decoys included. It never names the chosen vault or the amount. `VaultRecord<typeof VAULTS>` is the same type, narrowed to your config.

| Field       | Type                    | Description                                      |
| ----------- | ----------------------- | ------------------------------------------------ |
| `v`         | `1`                     | The format version.                              |
| `chainId`   | `number`                | The chain the batchers are on.                   |
| `groupId`   | `string`                | The group joined.                                |
| `direction` | `"deposit" \| "redeem"` | Whether the join deposited or redeemed.          |
| `account`   | `Address`               | The account the batchers credited.               |
| `legs`      | `JoinLeg[]`             | One leg per vault of the group, in config order. |

Each `JoinLeg` is `{ vaultId, batcher, batchId }`: the vault, the batcher the leg joined (one of that vault's deposit or redeem batchers, retired ones included), and the batch it landed in. Every method that takes a record throws `ConfigurationError` when the record is for another chain, does not hold one leg per vault in config order, or names a batcher the config does not list for that vault and direction.

### Position

A join record read from chain. `VaultPosition<typeof VAULTS>` is the same type, narrowed to your config.

| Field              | Type             | Description                                                                                                          |
| ------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `record`           | `JoinRecord`     | The join read.                                                                                                       |
| `phase`            | `PositionPhase`  | Where the join is, taken over all its legs.                                                                          |
| `legs`             | `Leg[]`          | One per record leg, in the same order.                                                                               |
| `availableActions` | `VaultAction[]`  | The actions you can send now: `"exit"`, `"dispatch"`, `"finalize"`. Each maps to the client method of the same name. |
| `chosenVaultId`    | `string \| null` | The vault with a non-zero deposit, after a read with `decrypt`. `null` otherwise. Never stored in the record.        |
| `observedAt`       | `bigint`         | The block timestamp the read was made at.                                                                            |
| `nextChangeAt`     | `bigint \| null` | The next chain time at which `availableActions` can change on its own, or `null`.                                    |

`PositionPhase` and the actions it allows:

| `phase`    | When                                                                     | `availableActions`                                           |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `queued`   | Every leg is pending.                                                    | `exit`, plus `dispatch` once a leg's batch can be dispatched |
| `settling` | Some leg is dispatched.                                                  | `finalize`                                                   |
| `ready`    | No leg is dispatched, and some leg is finalized or canceled.             | `exit`, plus `dispatch` when a pending leg can be dispatched |
| `closed`   | Read with `decrypt`, and every deposit is zero: the position was exited. | none                                                         |

`nextChangeAt` is the earliest future time among each pending leg's `dispatchableAt` and each dispatched leg's `cancelsAt`.

### Leg

One leg as read from chain. Every leg has `vaultId`, `batcher`, `batchId`, `deposit` (the account's encrypted deposit in the batch) and `amount` (the decrypted deposit, or `null` without `decrypt`). The rest depends on `state`. Timestamps are chain seconds.

| `state`      | Extra fields                                       | Meaning                                                                                                           |
| ------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pending`    | `dispatchableAt: bigint`, `paused: boolean`        | Waiting for dispatch. Anyone may dispatch it from `dispatchableAt`. A paused batcher cannot dispatch.             |
| `dispatched` | `cancelsAt: bigint`                                | Sent to the vault, waiting for settlement. From `cancelsAt`, finalizing cancels the batch instead of settling it. |
| `finalized`  | `exchangeRate: { rate: bigint; decimals: number }` | Settled. A claim pays `deposit * rate / 10 ** decimals`, rounded down.                                            |
| `canceled`   | none                                               | Did not go through. Exiting refunds the deposit.                                                                  |

`BatchState` is the union of these four strings.

### OpenBatch

| Field            | Type      | Description                                                                                                                   |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `vaultId`        | `string`  | The vault.                                                                                                                    |
| `batcher`        | `Address` | The batcher the next join reaches for the direction read: a retired one until its `lastBatchId` is dispatched, then `latest`. |
| `batchId`        | `bigint`  | The open batch, which the next join lands in.                                                                                 |
| `dispatchableAt` | `bigint`  | When anyone may dispatch the batch, in chain seconds.                                                                         |
| `paused`         | `boolean` | A paused batcher takes no join and no dispatch.                                                                               |

## TanStack Query

The `vaults` subpath also exports framework-agnostic query and mutation options over the client. The [React hooks](../react/README.md) are built on them.

| Export                                                                                              | Wraps                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `positionQueryOptions(client, { record, decrypt?, query? })`                                        | `readPosition`. Refetches when `nextChangeAt` passes and polls while a leg settles. Disabled until `record` is set. |
| `openBatchesQueryOptions(client, { groupId, direction, query? })`                                   | `readOpenBatches`                                                                                                   |
| `depositMutationOptions(client)`, `redeemMutationOptions(client)`                                   | `deposit`, `redeem`. Variables are the join params plus an optional `options: JoinOptions`.                         |
| `exitMutationOptions(client)`, `dispatchMutationOptions(client)`, `finalizeMutationOptions(client)` | `exit`, `dispatch`, `finalize`. Variables are the join record.                                                      |

The mutation options do not invalidate anything by themselves. Call `invalidateAfterVaultAction` in `onSuccess`, as the React hooks do. For the query keys, see [`vaultQueryKeys`](../react/query-keys.md#vaultquerykeys).

### invalidateAfterVaultAction

`invalidateAfterVaultAction(queryClient, { chainId, groupId }) => void`

Invalidates every vault read of the group and every confidential balance. Call it after you send a prepared action yourself:

```ts
import { invalidateAfterVaultAction } from "@zama-fhe/sdk/vaults";

invalidateAfterVaultAction(queryClient, { chainId: record.chainId, groupId: record.groupId });
```

## Related

- [Vaults overview](../../guides/vaults/README.md)
- [Vault deposits and redemptions](../../guides/vaults/deposits.md)
- [Vault groups](../../guides/vaults/groups.md)
- [Building a vault UI](../../guides/vaults/building-a-ui.md)
- [Errors](errors.md#vaultactionnotallowederror) — the vault errors
