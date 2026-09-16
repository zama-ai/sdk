---
title: Vault deposits and withdrawals
description: How to deposit into and withdraw from a confidential ERC-4626 vault.
---

# Vault deposits and withdrawals

Confidential vaults batch deposits and redemptions together, execute the aggregate through an underlying ERC-4626 vault once decrypted, and let each participant claim their share. Core SDK usage imports from `@zama-fhe/sdk/vaults`; React hooks import from `@zama-fhe/react-sdk/vaults`. Both are separate subpaths, so this module is only bundled for apps that actually use it.

## The two layers

- **`VaultBatcher`** mirrors one on-chain batcher contract directly, the way `Token` mirrors an ERC-7984 confidential token. A vault has two directions — deposit and redeem — each behind its own batcher contract.
- **`Vault`** pairs a deposit batcher and a redeem batcher into one object with ERC-20-style methods (`deposit`, `requestWithdrawal`, …), the way `WrappedToken` builds on `Token`. It also automates a step you'd otherwise have to do by hand: granting the batcher an operator approval before it can pull the joined amount — see [Operator approvals](./operator-approvals.md).

Most apps should use `Vault` (`useVault` / `useDeposit` / `useRequestWithdrawal` in React). Reach for `VaultBatcher` (`useVaultBatcher` / `useJoin` / `useClaim` / …) directly only if you need a single direction, or want to control the operator grant yourself.

## Steps

### 1. Create a vault instance

`createVault` (or `useVault`) takes the SDK instance and the three addresses that make up one vault: the underlying ERC-4626 vault contract, and its deposit and redeem batcher contracts.

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { createVault } from "@zama-fhe/sdk/vaults";

const addresses = {
  vault: "0xVault",
  depositBatcher: "0xDepositBatcher",
  redeemBatcher: "0xRedeemBatcher",
};
const vault = createVault(sdk, addresses);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useVault } from "@zama-fhe/react-sdk/vaults";

const addresses = {
  vault: "0xVault",
  depositBatcher: "0xDepositBatcher",
  redeemBatcher: "0xRedeemBatcher",
};
const vault = useVault(addresses);
```

{% endtab %}
{% endtabs %}

### 2. Deposit

Depositing encrypts the amount, grants the deposit batcher an operator approval on the underlying token if one isn't already active, and joins the currently open batch:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { txHash, batchId } = await vault.deposit(1_000_000n);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
const deposit = useDeposit({ addresses });
deposit.mutate({ amount: 1_000_000n });
```

{% endtab %}
{% endtabs %}

`deposit` returns the `batchId` it joined, read back from the batcher's `Joined` event — keep it, since every later call (`batchState`, `claim`, `quit`) needs it.

Pass `beneficiary` to credit a different account, and `operatorDeadline` to control how long the operator grant lasts (defaults to 1 hour, same as `Token.setOperator`). The React hook invalidates the deposit token's balance cache on success.

{% hint style="warning" %}
The beneficiary owns the position, not the caller: only they can `quit` it, and `claim` always pays out to them.

A deposit larger than your confidential balance does **not** revert. ERC-7984 transfers move zero rather than failing, so the transaction succeeds and joins nothing. The returned `confidentialJoinedAmount` is what actually landed — decrypt it, or call `depositBatcher.depositOf(batchId, account)`, to confirm.
{% endhint %}

### 3. Track the batch

`deposit` already gave you the batch id. Read its state from the deposit batcher:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const state = await vault.depositBatcher.batchState(batchId);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
// deposit.data.batchId once the mutation resolves; useCurrentBatchId reads
// whichever batch is open right now, for a "next batch" display.
const { data: state } = useBatchState({
  address: vault.depositBatcher.address,
  batchId: deposit.data?.batchId,
});
```

{% endtab %}
{% endtabs %}

`batchState` decides which action is legal, so read it before offering the user a button:

| `BatchState` | What it means                                                 | What the user can do                       |
| ------------ | ------------------------------------------------------------- | ------------------------------------------ |
| `Pending`    | Open, accepting joins. Always the batcher's `currentBatchId`. | `deposit` / `requestWithdrawal`, or `quit` |
| `Dispatched` | Closed; the aggregate amount is being decrypted.              | Nothing — wait                             |
| `Finalized`  | Settled with an exchange rate.                                | `claim`                                    |
| `Canceled`   | The route failed, or the callback deadline passed.            | `quit`, to take the deposit back           |

{% hint style="warning" %}
`Canceled` is the last value, not "done". Claiming a canceled batch reverts — a canceled batch never executed, so there is nothing to claim, only a deposit to take back with `quit`.
{% endhint %}

There's necessarily a delay between joining a batch and being able to claim it — batching is the whole point, and dispatch only becomes possible once the batch is old enough. To show a countdown or decide when to poll again, use `timeUntilDispatchable`:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const secondsLeft = await vault.depositBatcher.timeUntilDispatchable(batchId);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
// refetchInterval polls for a live countdown; omit it to fetch once.
const { data: secondsLeft } = useTimeUntilDispatchable({
  address: vault.depositBatcher.address,
  batchId,
  refetchInterval: 5_000,
});
```

{% endtab %}
{% endtabs %}

It returns `0` once the batch is old enough — not a guarantee dispatch will succeed at that exact moment (someone still has to submit the transaction, and it's fine to dispatch later than this), just the earliest point it's possible.

### 4. Dispatch the batch

Once a batch has been open for at least `minBatchAge` (i.e. `timeUntilDispatchable` reads `0`), anyone can dispatch it — this is a permissionless call, not something only participants can trigger:

{% tabs %}
{% tab title="Core SDK" %}

```ts
await vault.depositBatcher.dispatchBatch();
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
const dispatchBatch = useDispatchBatch({ address: vault.depositBatcher.address });
dispatchBatch.mutate();
```

{% endtab %}
{% endtabs %}

Dispatching decrypts the batch's aggregate amount and executes the real deposit against the underlying vault. Individual participants' amounts are never decrypted — only the aggregate. This call can revert if the batch isn't old enough yet, or has already been dispatched.

Once dispatched, `batchDispatchedAt(batchId)` returns the dispatch timestamp (`0` before that). Combined with `batchCallbackDeadline(batchId)` — a duration, not a timestamp — that gives the absolute deadline by which finalization must land: `batchDispatchedAt(batchId) + batchCallbackDeadline(batchId)`. Past it, the batch is canceled.

Use the per-batch reads (`batchMinBatchAge`, `batchCallbackDeadline`) rather than the batcher-wide `minBatchAge()` / `callbackDeadline()`: each batch pins the policy in force when it opened, so the batcher-wide values describe future batches, not this one.

### 5. Claim

Dispatch only starts the decryption; finalization lands later, when the relayer delivers the callback. Wait for `batchState` to reach `Finalized`, then claim. Claiming is permissionless — anyone can call it on another account's behalf, but the output always goes to that account, never to the caller:

{% tabs %}
{% tab title="Core SDK" %}

```ts
// Only once batchState(batchId) === BatchState.Finalized.
await vault.depositBatcher.claim(batchId);

const shareToken = await vault.shareToken();
const balance = await shareToken.balanceOf(myAddress);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
const claim = useClaim({ address: vault.depositBatcher.address });
claim.mutate({ batchId });

// useConfidentialBalance works directly on the share token's address —
// no vault-specific balance hook needed.
const { data: balance } = useConfidentialBalance({ address: shareTokenAddress });
```

{% endtab %}
{% endtabs %}

## Withdrawals

Withdrawals mirror deposits exactly, using the redeem batcher instead:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { batchId } = await vault.requestWithdrawal(500n);

await vault.redeemBatcher.dispatchBatch(); // once timeUntilDispatchable(batchId) is 0
// …then wait for batchState(batchId) to reach BatchState.Finalized:
await vault.redeemBatcher.claim(batchId);

const depositToken = await vault.depositToken();
const balance = await depositToken.balanceOf(myAddress);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
const requestWithdrawal = useRequestWithdrawal({ addresses });
requestWithdrawal.mutate({ amount: 500n });

const dispatchBatch = useDispatchBatch({ address: vault.redeemBatcher.address });
const claim = useClaim({ address: vault.redeemBatcher.address });
```

{% endtab %}
{% endtabs %}

## Getting a deposit back

`quit` is the only refund path, and it covers both cases: undoing a join before the batch is dispatched, and taking the deposit back after a batch was canceled (the route failed, or the callback deadline passed). It refunds the caller's own deposit — there is no third-party form, so a position joined for a `beneficiary` can only be quit by that beneficiary.

{% tabs %}
{% tab title="Core SDK" %}

```ts
// Legal while batchState(batchId) is Pending or Canceled.
await vault.depositBatcher.quit(batchId);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
const quit = useQuit({ address: vault.depositBatcher.address });
quit.mutate({ batchId });
```

{% endtab %}
{% endtabs %}

## Next steps

- [Operator approvals](./operator-approvals.md) — the approval model `vault.deposit()` / `vault.requestWithdrawal()` automate
- [Check balances](./check-balances.md) — reading confidential balances on `depositToken()` / `shareToken()`
