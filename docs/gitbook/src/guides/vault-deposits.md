---
title: Vault deposits and redemptions
description: How to integrate confidential ERC-4626 vaults with the Zama SDK.
---

# Vault deposits and redemptions

This guide covers **integrating** a confidential vault from the SDK. For what a confidential vault is, how batching and settlement work on-chain, and the contracts themselves, see the [Confidential Vault documentation](https://docs.zama.org/protocol/confidential-vault) — in particular its [deposit guide](https://docs.zama.org/protocol/confidential-vault/guides/deposit).

Core SDK usage imports from `@zama-fhe/sdk/vaults`; React hooks import from `@zama-fhe/react-sdk/vaults`. Both are separate subpaths, so this module is only bundled for apps that actually use it.

## The two layers

- **`VaultBatcher`** mirrors one on-chain batcher contract directly, the way `Token` mirrors an ERC-7984 confidential token. A vault has two directions — deposit and redeem — each behind its own batcher contract.
- **`Vault`** pairs a deposit batcher and a redeem batcher into one object with ERC-20-style methods (`deposit`, `requestRedeem`, …), the way `WrappedToken` builds on `Token`. It also automates a step you'd otherwise have to do by hand: granting the batcher an operator approval before it can pull the joined amount — see [Operator approvals](./operator-approvals.md).

Most apps should use `Vault` (`useVault` / `useDeposit` / `useRequestRedeem` in React). Reach for `VaultBatcher` (`useVaultBatcher` / `useJoin` / `useClaim` / …) directly only if you need a single direction, or want to control the operator grant yourself.

## Steps

### 1. Create a vault instance

`createVault` (or `useVault`) takes the SDK instance and the vault's two batcher addresses.

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { createVault } from "@zama-fhe/sdk/vaults";

const addresses = { depositBatcher: "0xDepositBatcher", redeemBatcher: "0xRedeemBatcher" };
const vault = createVault(sdk, addresses);

// Resolved from the batchers on first use, then cached:
const vaultAddress = await vault.vaultAddress();
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useVault } from "@zama-fhe/react-sdk/vaults";

const addresses = { depositBatcher: "0xDepositBatcher", redeemBatcher: "0xRedeemBatcher" };
const vault = useVault(addresses);
```

{% endtab %}
{% endtabs %}

You don't have to supply the underlying ERC-4626 vault address: both batchers report it on-chain, and `vaultAddress()` reads it once and caches it. Pass `vault` anyway if you want it checked — a pair of batchers that report different vaults, or a configured address the batchers disagree with, throws instead of silently settling against the wrong contract.

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

Pass `beneficiary` to credit a different account, and `operatorUntil` to control how long the operator grant lasts (defaults to 1 hour, same as `Token.setOperator`). The React hook invalidates the deposit token's balance cache on success.

{% hint style="warning" %}
The beneficiary owns the position, not the caller: only they can `quit` it, and `claim` always pays out to them.
{% endhint %}

The SDK checks your confidential balance before submitting, exactly as `Token.confidentialTransfer` does — an ERC-7984 transfer moves zero instead of reverting, so without that check a too-large deposit would succeed on-chain and join nothing. Pass `skipBalanceCheck: true` for accounts whose balance the connected signer can't decrypt (smart wallets). The returned `confidentialJoinedAmount` is still the authoritative record of what landed: decrypt it, or call `depositBatcher.depositOf(batchId, account)`, to confirm.

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

| `BatchState` | What the user can do                            |
| ------------ | ----------------------------------------------- |
| `Pending`    | `deposit` / `requestRedeem`, or `quit`          |
| `Dispatched` | Nothing — wait                                  |
| `Finalized`  | `claim`                                         |
| `Canceled`   | `quit` (or `recover`), to take the deposit back |

{% hint style="warning" %}
`Canceled` is the last enum value, not "done". Claiming a canceled batch reverts — a canceled batch never executed, so there is nothing to claim, only a deposit to take back.
{% endhint %}

To show a countdown, or decide when to poll again, use `timeUntilDispatchable`:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const secondsLeft = await vault.depositBatcher.timeUntilDispatchable(batchId);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
// refetchInterval polls for a live countdown; omit it to fetch once.
const { data: secondsLeft } = useTimeUntilDispatchable(
  { address: vault.depositBatcher.address, batchId },
  { refetchInterval: 5_000 },
);
```

{% endtab %}
{% endtabs %}

It returns `0` once the batch is old enough — the earliest moment dispatch is possible, not a guarantee anyone will dispatch then. It returns `null` once the batch has left `Pending` and can no longer be dispatched at all, so `0` never has to stand in for "already dispatched".

### 4. Dispatch the batch

Once `timeUntilDispatchable` reads `0`, anyone can dispatch the batch — this is a permissionless call, not something only participants can trigger:

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

Use the per-batch reads (`batchMinBatchAge`, `batchCallbackDeadline`) rather than the batcher-wide `minBatchAge()` / `callbackDeadline()`: each batch pins the policy in force when it opened, so the batcher-wide values describe future batches, not this one. `batchDispatchedAt(batchId) + batchCallbackDeadline(batchId)` gives the timestamp finalization must land by; past it, the batch is canceled.

### 5. Claim

Dispatch only starts the decryption; finalization lands later. Wait for `batchState` to reach `Finalized`, then claim. Claiming is permissionless — anyone can call it on another account's behalf, but the output always goes to that account, never to the caller:

{% tabs %}
{% tab title="Core SDK" %}

```ts
// Only once batchState(batchId) === BatchState.Finalized.
await vault.depositBatcher.claim(batchId);

const cShare = await vault.cShare();
const balance = await cShare.balanceOf(myAddress);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
const claim = useClaim({ address: vault.depositBatcher.address });
claim.mutate({ batchId });

// useConfidentialBalance works directly on the share token's address —
// no vault-specific balance hook needed.
const { data: balance } = useConfidentialBalance({ address: cShareAddress });
```

{% endtab %}
{% endtabs %}

## Redemptions

Redemptions mirror deposits exactly, using the redeem batcher instead. The amount is
denominated in shares, not assets — ERC-4626 `redeem`, not `withdraw`:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { batchId } = await vault.requestRedeem(500n);

await vault.redeemBatcher.dispatchBatch(); // once timeUntilDispatchable(batchId) is 0
// …then wait for batchState(batchId) to reach BatchState.Finalized:
await vault.redeemBatcher.claim(batchId);

const cAsset = await vault.cAsset();
const balance = await cAsset.balanceOf(myAddress);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
const requestRedeem = useRequestRedeem({ addresses });
requestRedeem.mutate({ amount: 500n });

const dispatchBatch = useDispatchBatch({ address: vault.redeemBatcher.address });
const claim = useClaim({ address: vault.redeemBatcher.address });
```

{% endtab %}
{% endtabs %}

## Getting a deposit back

`quit` refunds the caller's own deposit. It works both before the batch is dispatched (undoing a join) and after a batch was canceled:

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

`recover` does the same for someone else. It is permissionless and only legal on a **canceled** batch, and the refund always goes to the depositor, never to the caller — so a keeper, or the app itself, can clean up a canceled batch on behalf of users who joined for a `beneficiary` and would otherwise have to come back and quit themselves:

{% tabs %}
{% tab title="Core SDK" %}

```ts
// Legal only while batchState(batchId) is Canceled.
await vault.depositBatcher.recover(batchId, "0xDepositor");
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
const recover = useRecover({ address: vault.depositBatcher.address });
recover.mutate({ batchId, account: "0xDepositor" });
```

{% endtab %}
{% endtabs %}

## Next steps

- [Confidential Vault documentation](https://docs.zama.org/protocol/confidential-vault) — the protocol side: how batching, dispatch and settlement work
- [Operator approvals](./operator-approvals.md) — the approval model `vault.deposit()` / `vault.requestRedeem()` automate
- [Check balances](./check-balances.md) — reading confidential balances on `cAsset()` / `cShare()`
