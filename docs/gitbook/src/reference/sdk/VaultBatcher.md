---
title: VaultBatcher
description: One on-chain vault batcher — join, batch state, dispatch, claim, quit, recover.
---

# VaultBatcher

`VaultBatcher` mirrors one on-chain batcher contract, the way [`Token`](Token.md) mirrors an ERC-7984 token. A batcher pools participants' encrypted amounts, dispatches only the decrypted aggregate through the underlying ERC-4626 vault, and lets each participant claim their share of the output.

A vault has one batcher per direction — deposit and redeem — so a [`Vault`](Vault.md) holds two instances. Most apps should start from `Vault`, which adds the operator-approval step to `join`, and reach for `VaultBatcher` directly only for a single direction or to control the approval yourself.

The lifecycle is `join` → `dispatchBatch` → `claim`. Finalization between the last two is driven by the relayer, not the caller: a batch is claimable only once it reaches `BatchState.Finalized`, which can be well after dispatch.

## Import

```ts
import { createVaultBatcher, VaultBatcher, BatchState } from "@zama-fhe/sdk/vaults";
```

## Construction

Use `createVaultBatcher(sdk, address)`, or take one from a `Vault`:

```ts
import { createVaultBatcher } from "@zama-fhe/sdk/vaults";

const depositBatcher = createVaultBatcher(sdk, "0xDepositBatcher");
const { batchId } = await depositBatcher.join(1_000_000n);

const sameBatcher = vault.depositBatcher;
```

## Properties

### sdk

`ZamaSDK`

The SDK instance this batcher reads and writes through.

### address

`Address`

Checksummed address of the batcher contract.

## BatchState

```ts
import { BatchState } from "@zama-fhe/sdk/vaults";
```

A batch's lifecycle state. The numbers mirror the contract's own enum. `batchState()` returns one of these, and it decides which write is legal:

| Value                   | Meaning                                                                       | Legal writes      |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------- |
| `BatchState.Pending`    | `0` — open. Always the batcher's `currentBatchId()`.                          | `join`, `quit`    |
| `BatchState.Dispatched` | `1` — closed; the aggregate amount is being decrypted.                        | none — wait       |
| `BatchState.Finalized`  | `2` — settled with an exchange rate.                                          | `claim`           |
| `BatchState.Canceled`   | `3` — the route failed or the callback deadline passed; nothing was executed. | `quit`, `recover` |

Claiming a canceled batch reverts — there is nothing to claim, only a deposit to take back.

## Address reads

These are set at deploy time and never change, so each is read once and cached forever per instance.

### vault

`() => Promise<Address>`

The underlying ERC-4626 vault. Share price (`convertToShares`, `convertToAssets`, `totalAssets`) is read from it directly, not from the batcher.

### fromToken

`() => Promise<Address>`

The confidential token this batcher accepts as input — the asset for a deposit batcher, shares for a redeem batcher. `join` checks the caller's balance on this token, and `quit` / `recover` refund to it.

### toToken

`() => Promise<Address>`

The confidential token this batcher pays out — shares for a deposit batcher, the asset for a redeem batcher. `claim` credits this token.

```ts
const [vaultAddress, input, output] = await Promise.all([
  batcher.vault(),
  batcher.fromToken(),
  batcher.toToken(),
]);
```

## Batch reads

### currentBatchId

`() => Promise<bigint>`

The id of the currently open (not-yet-dispatched) batch. Batch ids start at `1`.

### batchState

`(batchId: bigint) => Promise<BatchState>`

A batch's lifecycle state — see [BatchState](#batchstate). Reverts on-chain with `BatchNonexistent` for an id above `currentBatchId()`.

```ts
if ((await batcher.batchState(batchId)) === BatchState.Finalized) {
  await batcher.claim(batchId);
}
```

### timeUntilDispatchable

`(batchId: bigint) => Promise<bigint | null>`

Seconds until `batchId` becomes eligible for dispatch, `0` once it already is. This is the earliest possible moment, not a promise that anyone will dispatch then. Returns `null` once the batch has left `Pending` and can never be dispatched again, so `0` never has to stand in for "already dispatched".

Measured against the chain's block timestamp and the batch's own pinned minimum age (`batchCreatedAt + batchMinBatchAge`), so neither local clock drift nor a mid-flight policy change desyncs a countdown.

```ts
const secondsLeft = await batcher.timeUntilDispatchable(batchId);
if (secondsLeft === 0n) await batcher.dispatchBatch();
```

### batchCreatedAt

`(batchId: bigint) => Promise<bigint>`

Unix timestamp (seconds) at which the batch was opened.

### batchDispatchedAt

`(batchId: bigint) => Promise<bigint>`

Unix timestamp (seconds) at which the batch was dispatched, or `0` if it hasn't been yet.

### batchMinBatchAge

`(batchId: bigint) => Promise<bigint>`

The minimum age in seconds pinned to `batchId` when it opened — the value dispatch enforces for this batch.

### batchCallbackDeadline

`(batchId: bigint) => Promise<bigint>`

The callback deadline in seconds pinned to `batchId` when it opened. `batchDispatchedAt(batchId) + batchCallbackDeadline(batchId)` is the timestamp finalization must land by; past it, the batch is canceled.

### exchangeRate

`(batchId: bigint) => Promise<bigint>`

A finalized batch's exchange rate, scaled by `exchangeRateDecimals()`; `0` until the batch finalizes. A claim pays out `deposit * exchangeRate / 10 ** exchangeRateDecimals`, rounded down.

### exchangeRateDecimals

`() => Promise<number>`

The number of decimals `exchangeRate` is scaled by.

### confidentialTotalDeposits

`(batchId: bigint) => Promise<EncryptedValue>`

The encrypted aggregate amount joined into a batch, without decrypting it.

### confidentialDepositOf

`(batchId: bigint, account: Address) => Promise<EncryptedValue>`

The encrypted amount `account` joined into a batch, without decrypting it.

### depositOf

`(batchId: bigint, account: Address) => Promise<bigint>`

Decrypts and returns the plaintext amount `account` joined into a batch. Acquires FHE credentials via a wallet signature if none are cached, like `Token.balanceOf`. Returns `0n` without a relayer round-trip when the encrypted value is the zero handle.

```ts
const joined = await batcher.depositOf(batchId, address);
```

## Batcher policy reads

The batcher-wide values describe batches opened **from now on**. An existing batch pins the policy in force when it opened — use the per-batch reads above (`batchMinBatchAge`, `batchCallbackDeadline`) for it.

### paused

`() => Promise<boolean>`

Whether the batcher is paused. While paused, `join` and `dispatchBatch` revert; `quit` and `claim` still work.

### minBatchAge

`() => Promise<bigint>`

The minimum age in seconds for batches opened from now on.

### callbackDeadline

`() => Promise<bigint>`

How long a dispatched batch may wait for its decryption callback before it is canceled — seconds, not a timestamp, despite the name. Applies to batches opened from now on.

## Writes

Every write requires a configured signer and throws [`SignerNotConfiguredError`](errors.md#signernotconfigurederror) without one. All of them resolve to a `TransactionResult` (`{ txHash, receipt }`); `join` returns the richer `JoinResult`.

### join

`(amount: bigint, beneficiary?: Address, options?: JoinOptions) => Promise<JoinResult>`

Joins the currently open batch with a plaintext amount, encrypted automatically. `amount` is denominated in `fromToken`'s base units. `beneficiary` defaults to the connected wallet account and owns the resulting position.

The batcher must already hold an ERC-7984 operator grant from the caller, or it cannot pull the amount — `Vault.deposit` / `Vault.redeem` grant it for you; with a bare `VaultBatcher` call `Token.setOperator` on `fromToken` first. A join with too little balance still succeeds on-chain and credits nothing, so the SDK checks the caller's confidential balance on `fromToken` first.

```ts
const { txHash, batchId, beneficiary, confidentialJoinedAmount } = await batcher.join(1_000_000n);
```

Options (`JoinOptions`):

| Option             | Type      | Default | Description                                                                                              |
| ------------------ | --------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `skipBalanceCheck` | `boolean` | `false` | Skip the confidential-balance pre-flight, for accounts whose balance the connected signer can't decrypt. |

Returns a `JoinResult` — `TransactionResult` plus `batchId`, `beneficiary` and `confidentialJoinedAmount`, decoded from the `Joined` event. See [`Vault` → JoinResult](Vault.md#joinresult) for the field table.

**Throws:**

- [`InsufficientConfidentialBalanceError`](errors.md#insufficientconfidentialbalanceerror) — the balance on `fromToken` is less than `amount`.
- [`BalanceCheckUnavailableError`](errors.md#balancecheckunavailableerror) — the balance check needs a decryption the signer can't perform.
- [`TransactionRevertedError`](errors.md#transactionrevertederror) — the receipt carries no `Joined` event for the beneficiary.

### dispatchBatch

`() => Promise<TransactionResult>`

Closes the current batch once it has reached its pinned minimum age and kicks off decryption of its aggregate amount. Permissionless — any account with a configured signer can call this, not just participants. Reverts while the batcher is `paused()`, or while `timeUntilDispatchable` is above `0`.

```ts
await batcher.dispatchBatch();
```

### claim

`(batchId: bigint, account?: Address) => Promise<TransactionResult>`

Claims a finalized batch's output for `account` (default: the connected wallet account). Permissionless — anyone can call this on another account's behalf, and the output always goes to `account`, never to the caller. The amount is not returned; read it as a balance on `toToken`.

Only legal once the batch reaches `BatchState.Finalized`. On a canceled batch use `quit` or `recover` instead.

```ts
await batcher.claim(batchId);
await batcher.claim(batchId, "0xSomeoneElse");
```

### quit

`(batchId: bigint) => Promise<TransactionResult>`

Withdraws the caller's own deposit from a batch, returning it to their confidential balance on `fromToken`. Legal in two states: `Pending` (undo a join before dispatch) and `Canceled` (take the deposit back after a batch failed to finalize).

Refunds the caller only. To refund someone else's deposit in a canceled batch, use `recover`.

```ts
await batcher.quit(batchId);
```

### recover

`(batchId: bigint, account?: Address) => Promise<TransactionResult>`

Refunds `account`'s deposit (default: the connected wallet account) in a **canceled** batch on their behalf. Permissionless — anyone can call this, and the refund always goes to `account`, never to the caller. Lets a keeper, or the app itself, clean up a canceled batch for users who joined via a `beneficiary`.

Only legal once the batch reaches `BatchState.Canceled`; before that, a participant undoes their own join with `quit`.

```ts
await batcher.recover(batchId, "0xDepositor");
```

## Events

```ts
import { VaultTopics, decodeJoined, findJoined, type JoinedEvent } from "@zama-fhe/sdk/vaults";
```

`join` decodes its own receipt, but the helpers are exported for apps that index logs themselves.

- `VaultTopics.Joined` — topic0 of `Joined(uint256 indexed batchId, address indexed account, euint64 amount)`.
- `decodeJoined(log)` — decodes one raw log into `{ batchId, account, confidentialAmount }`, or `null` if it isn't a `Joined` event.
- `findJoined(logs, batcher, account?)` — the first `Joined` log emitted by `batcher` (and crediting `account`, when given). Filters by emitter and account because one transaction can join several batchers and credit several beneficiaries.

## TanStack Query helpers

```ts
import {
  vaultQueryKeys,
  batchStateQueryOptions,
  currentBatchIdQueryOptions,
  timeUntilDispatchableQueryOptions,
  joinMutationOptions,
  claimMutationOptions,
  quitMutationOptions,
  recoverMutationOptions,
  dispatchBatchMutationOptions,
  invalidateBatchQueries,
} from "@zama-fhe/sdk/vaults";
```

The React hooks are built on these query and mutation option builders; they are exported for non-React TanStack Query consumers and for custom compositions. Each takes a `VaultBatcher` (or a `Vault` for `depositMutationOptions` / `redeemMutationOptions`). See [Query keys → `vaultQueryKeys`](../react/query-keys.md#vaultquerykeys) for the cache keys and invalidation helpers.

## Related

- [Vault](Vault.md) — pairs two batchers behind `deposit()` / `redeem()` with automatic operator approval
- [Vault deposits and redemptions](../../guides/vault-deposits.md) — the full flow, including when each write is legal
- [Errors](errors.md) — the error classes thrown above
- [useVaultBatcher](../react/useVaultBatcher.md) — React hook returning a `VaultBatcher`
