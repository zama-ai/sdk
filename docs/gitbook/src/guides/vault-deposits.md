---
title: Vault deposits and redemptions
description: How to integrate confidential ERC-4626 vaults with the Zama SDK.
---

# Vault deposits and redemptions

This guide covers **integrating** a confidential vault from the SDK. For what a confidential vault is, how batching and settlement work on-chain, and the contracts themselves, see the [Confidential Vault documentation](https://docs.zama.org/protocol/confidential-vault) — in particular its [deposit guide](https://docs.zama.org/protocol/confidential-vault/guides/deposit).

Core SDK usage imports from `@zama-fhe/sdk/vaults`; React hooks import from `@zama-fhe/react-sdk/vaults`. Both are separate subpaths, so this module is only bundled for apps that actually use it.

## The two layers

- **`VaultBatcher`** mirrors one on-chain batcher contract directly, the way `Token` mirrors an ERC-7984 confidential token. A vault has two directions — deposit and redeem — each behind its own batcher contract.
- **`Vault`** pairs a deposit batcher and a redeem batcher into one object with ERC-4626-style methods (`deposit`, `redeem`, …), the way `WrappedToken` builds on `Token`. It also automates a step you'd otherwise have to do by hand: granting the batcher an operator approval before it can pull the joined amount — see [Operator approvals](./operator-approvals.md).

Most apps should use `Vault` (`useVault` / `useDeposit` / `useRedeem` in React). Reach for `VaultBatcher` (`createVaultBatcher`, or `useVaultBatcher` / `useJoin` / `useClaim` / … in React) directly only if you need a single direction, or want to control the operator grant yourself.

## Steps

### 1. Create a vault instance

`createVault` (or `useVault`) takes the SDK instance and the vault's two batcher addresses.

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { createVault } from "@zama-fhe/sdk/vaults";

const addresses = {
  depositBatcher: "0xDepositBatcher",
  redeemBatcher: "0xRedeemBatcher",
  vault: "0xVault", // optional — verified against what the batchers report, not trusted
};
const vault = createVault(sdk, addresses);

const vaultAddress = await vault.vaultAddress();
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useVault } from "@zama-fhe/react-sdk/vaults";

const addresses = {
  depositBatcher: "0xDepositBatcher",
  redeemBatcher: "0xRedeemBatcher",
  vault: "0xVault", // optional — verified against what the batchers report, not trusted
};
const vault = useVault(addresses);
```

{% endtab %}
{% endtabs %}

You don't have to supply the underlying ERC-4626 vault address: both batchers report it on-chain, and `vaultAddress()` reads it once and caches it. Pass `vault` anyway if you want it checked, as above — a pair of batchers that report different vaults, or a configured address the batchers disagree with, throws instead of silently settling against the wrong contract.

The snippets below reuse `sdk`, `addresses` and `vault` from this step, and `address` is the connected wallet.

### 2. Deposit

Depositing grants the deposit batcher an operator approval on the underlying token if one isn't already active, checks the caller's confidential balance, encrypts the amount, and joins the currently open batch:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { txHash, batchId } = await vault.deposit(1_000_000n);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useDeposit } from "@zama-fhe/react-sdk/vaults";

const deposit = useDeposit({ addresses });
deposit.mutate({ amount: 1_000_000n });
```

{% endtab %}
{% endtabs %}

The amount is denominated in the confidential asset token's base units — the token `vault.cAsset()` returns, with its `decimals()` — so `1_000_000n` is one unit of a 6-decimal asset.

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
import { useBatchState, useCurrentBatchId } from "@zama-fhe/react-sdk/vaults";

const batchId = deposit.data?.batchId;
const { data: state } = useBatchState({ address: vault.depositBatcher.address, batchId });

const { data: openBatchId } = useCurrentBatchId({ address: vault.depositBatcher.address });
```

{% endtab %}
{% endtabs %}

`useCurrentBatchId` reads whichever batch is open right now — for a "next batch" display, not for following a deposit you already made, since the open id moves on at every dispatch.

`batchState` decides which action is legal, so read it before offering the user a button:

| `BatchState` | What the user can do                            |
| ------------ | ----------------------------------------------- |
| `Pending`    | `deposit` / `redeem`, or `quit`                 |
| `Dispatched` | Nothing — wait                                  |
| `Finalized`  | `claim`                                         |
| `Canceled`   | `quit` (or `recover`), to take the deposit back |

{% hint style="warning" %}
Claiming a canceled batch reverts — a canceled batch never executed, so there is nothing to claim, only a deposit to take back with `quit` or `recover`.
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
import { useTimeUntilDispatchable } from "@zama-fhe/react-sdk/vaults";

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
import { useDispatchBatch } from "@zama-fhe/react-sdk/vaults";

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
await vault.depositBatcher.claim(batchId);

const cShare = await vault.cShare();
const balance = await cShare.balanceOf(address);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useConfidentialBalance } from "@zama-fhe/react-sdk";
import { useClaim } from "@zama-fhe/react-sdk/vaults";

const claim = useClaim({ address: vault.depositBatcher.address });
claim.mutate({ batchId });

const cShareAddress = "0xCShare";
const { data: balance } = useConfidentialBalance({ address: cShareAddress, account: address });
```

{% endtab %}
{% endtabs %}

The share token is an ordinary confidential token, so `useConfidentialBalance` reads it directly — there is no vault-specific balance hook, and none that resolves the share token's address. Configure `cShareAddress` alongside the batcher addresses, as above, or read it once with `(await vault.cShare()).address` — in a `useEffect`, or a `useQuery` keyed on the vault — and keep it in state. The address is fixed at deploy time, so one read is enough.

## Redemptions

Redemptions mirror deposits exactly, using the redeem batcher instead. The amount is
denominated in shares, not assets — ERC-4626 `redeem`, not `withdraw`:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { batchId } = await vault.redeem(500n);

await vault.redeemBatcher.dispatchBatch(); // once timeUntilDispatchable(batchId) is 0
// …then wait for batchState(batchId) to reach BatchState.Finalized:
await vault.redeemBatcher.claim(batchId);

const cAsset = await vault.cAsset();
const balance = await cAsset.balanceOf(address);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useRedeem } from "@zama-fhe/react-sdk/vaults";

const redeem = useRedeem({ addresses });
redeem.mutate({ amount: 500n });
```

{% endtab %}
{% endtabs %}

From here, steps 3 to 5 apply unchanged with `vault.redeemBatcher.address` in place of `vault.depositBatcher.address`; the claimed assets land on `vault.cAsset()`.

## Getting a deposit back

`quit` refunds the caller's own deposit. It works both before the batch is dispatched (undoing a join) and after a batch was canceled:

{% tabs %}
{% tab title="Core SDK" %}

```ts
await vault.depositBatcher.quit(batchId);
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useQuit } from "@zama-fhe/react-sdk/vaults";

const quit = useQuit({ address: vault.depositBatcher.address });
quit.mutate({ batchId });
```

{% endtab %}
{% endtabs %}

`recover` does the same for someone else. It is permissionless and only legal on a **canceled** batch, and the refund always goes to the depositor, never to the caller — so a keeper, or the app itself, can clean up a canceled batch on behalf of users who joined for a `beneficiary` and would otherwise have to come back and quit themselves:

{% tabs %}
{% tab title="Core SDK" %}

```ts
await vault.depositBatcher.recover(batchId, "0xDepositor");
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useRecover } from "@zama-fhe/react-sdk/vaults";

const recover = useRecover({ address: vault.depositBatcher.address });
recover.mutate({ batchId, account: "0xDepositor" });
```

{% endtab %}
{% endtabs %}

## Next steps

- [`Vault`](../reference/sdk/Vault.md) and [`VaultBatcher`](../reference/sdk/VaultBatcher.md) — full API reference, including the per-batch reads
- [`useDeposit`](../reference/react/useDeposit.md), [`useRedeem`](../reference/react/useRedeem.md), [`useBatchState`](../reference/react/useBatchState.md), [`useClaim`](../reference/react/useClaim.md) — the React hooks used above
- [Confidential Vault documentation](https://docs.zama.org/protocol/confidential-vault) — the protocol side: how batching, dispatch and settlement work
- [Operator approvals](./operator-approvals.md) — the approval model `vault.deposit()` / `vault.redeem()` automate
- [Check balances](./check-balances.md) — reading confidential balances on `cAsset()` / `cShare()`
