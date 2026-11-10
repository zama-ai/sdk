---
title: Building a vault UI
description: The states a vault deposit or redemption goes through, and what your UI should show and offer in each one.
---

# Building a vault UI

A vault deposit is not done when the transaction is mined. The amount joins a **batch**, the batch is sent to the vault later, and the user claims their shares after that. A UI that only covers the deposit form leaves users with funds they cannot see or move.

This guide lists every state your UI must handle and what to show in each one. It does not prescribe a layout: put the form in a modal, a page or a sidebar, and show batches in a list, a toast or a notification center. What matters is that no state is missing.

{% hint style="info" %}
Redemptions follow the same states with the redeem batcher. Read "shares" for "assets" below and the other way around.
{% endhint %}

## The journey

A deposit or redemption has three parts:

1. **The form.** The user picks an amount. Your UI checks it before sending.
2. **The send.** One transaction joins the open batch and returns its `batchId`.
3. **The batch.** The batch moves through its states until the user claims or takes the amount back.

## 1. The form

| Situation                                         | What to do                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The balance is encrypted                          | Show it as hidden with a button to decrypt it. The first decryption asks the wallet for a signature, so start it from a click. See [`useConfidentialBalance`](../../reference/react/useConfidentialBalance.md); [`useBatcherTokens`](../../reference/react/useBatcherTokens.md) gives the token addresses. |
| The amount is above the balance                   | Disable the button and say why. A confidential transfer above the balance moves zero instead of reverting; the SDK checks this before sending, but the user should not have to find out from an error.                                                                                                     |
| The batcher is paused                             | Read it with [`usePaused`](../../reference/react/usePaused.md), disable the button and say deposits are paused. Quit and claim still work while paused.                                                                                                                                                    |
| A redemption                                      | The amount is in shares, not assets. Label the field so the user knows which one they type.                                                                                                                                                                                                                |
| The user has public tokens, not confidential ones | Shield first with [`useShield`](../../reference/react/useShield.md), then deposit.                                                                                                                                                                                                                         |

## 2. The send

`useDeposit` and `useRedeem` return the `batchId` the amount joined. **Keep track of it**, so the user finds the batch again after a reload or on another device. Either store the id with the user's account, or rebuild the list from the chain: fetch the batcher's `Joined`, `Claimed` and `Quit` logs for the account and pass them to [`openBatchIds`](../../reference/sdk/VaultBatcher.md#events), which returns the batches the user joined and has not claimed or quit yet.

While the transaction is pending, lock the form so the user cannot send twice. Show "Confirm in your wallet" until the `onJoinSubmitted` callback you pass to `useDeposit` or `useRedeem` fires, then "Waiting for the transaction". If the callback throws, the SDK only logs a warning, so the label stays on "Confirm in your wallet".

After it is mined, say the amount is **queued**, not deposited. The user does not hold shares yet.

A vault page can render before the wallet is on the vault's chain, for example before it connects. Pass the vault's `chainId` to:

- The read hooks (`useBatchStatus`, `useCurrentBatchId`, `usePaused`, `useBatcherTokens`, …), so they read the vault's chain. This needs a provider that can read other chains, such as `WagmiProvider`.
- `useDeposit`, `useRedeem` and the batcher write hooks (`useClaim`, `useQuit`, `useFinalize`, …), so a wallet on another chain gets `ChainMismatchError` instead of sending there.

## 3. The batch

Read the batch with [`useBatchStatus`](../../reference/react/useBatchStatus.md). It returns the state and the timestamps that state needs in one call. The `secondsUntil*` values are correct at read time; for a live countdown, tick from the `*At` timestamps between refetches:

| State        | What the user sees                                    | What the user can do                              | Hooks                                                 |
| ------------ | ----------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `Pending`    | Queued, with the time until the batch can be sent     | Cancel, to get the amount back                    | [`useQuit`](../../reference/react/useQuit.md)         |
| `Dispatched` | Processing                                            | Wait. If the batch stays here too long, settle it | [`useFinalize`](../../reference/react/useFinalize.md) |
| `Finalized`  | Ready to claim                                        | Claim the shares                                  | [`useClaim`](../../reference/react/useClaim.md)       |
| `Canceled`   | The batch did not go through, the amount is available | Take the amount back                              | [`useQuit`](../../reference/react/useQuit.md)         |

Switch on `status.state` and handle every case. With an exhaustive `switch`, TypeScript flags a state your UI forgets:

```tsx
import { useBatchStatus, useClaim, useQuit } from "@zama-fhe/react-sdk/vaults";
import type { Address } from "@zama-fhe/sdk";
import { BatchState } from "@zama-fhe/sdk/vaults";

// `Row` and `formatSeconds` stand in for your own components and helpers.

function BatchRow({ batcher, batchId }: { batcher: Address; batchId: bigint }) {
  const { data: status } = useBatchStatus(
    { address: batcher, batchId },
    { refetchInterval: 10_000 },
  );
  const claim = useClaim({ address: batcher });
  const quit = useQuit({ address: batcher });

  if (!status) return <Row label="Loading…" />;

  switch (status.state) {
    case BatchState.Pending:
      return (
        <Row
          label={`Queued, sent in ${formatSeconds(status.secondsUntilDispatchable)} at the earliest`}
          action={{ label: "Cancel", onClick: () => quit.mutate({ batchId }) }}
        />
      );
    case BatchState.Dispatched:
      return <Row label="Processing" />;
    case BatchState.Finalized:
      return (
        <Row
          label="Ready to claim"
          action={{ label: "Claim", onClick: () => claim.mutate({ batchId }) }}
        />
      );
    case BatchState.Canceled:
      return (
        <Row
          label="Did not go through"
          action={{ label: "Get it back", onClick: () => quit.mutate({ batchId }) }}
        />
      );
    default:
      return status satisfies never;
  }
}
```

### Pending

The countdown is the earliest moment anyone may send the batch, not a promise. Word it as "at the earliest". When it reaches `0` the batch waits for someone to send it; anyone may call [`useDispatchBatch`](../../reference/react/useDispatchBatch.md), but you do not have to offer it.

### Dispatched

A keeper, an off-chain service that watches batches, normally settles the batch and the user only waits. If it stays `Dispatched` longer than your app expects, offer a button that calls `useFinalize`. Pick the delay yourself; the SDK does not decide when a keeper is late.

`status.secondsUntilCallbackDeadline` says how long settling remains possible. Once it reaches `0`, `useFinalize` **cancels** the batch instead of settling it, and the user then takes the amount back from `Canceled`. Label the button accordingly, for example "Cancel and get it back" rather than "Settle".

A redeem batcher whose vault settles redemptions asynchronously is the exception. Once it has placed the redemption request with the vault, `useFinalize` keeps settling past the deadline, or leaves the batch `Dispatched` until the vault pays out. For such a batcher, keep the "Settle" label after the deadline.

### Finalized

Claiming is a separate transaction. Show it clearly: until the user claims, the shares are not in their balance. Claiming is permissionless and pays the depositor, never the caller, so your backend may also claim on the user's behalf.

A claim or quit does not change the batch's state, and it replaces the user's encrypted deposit with an encrypted zero, so neither `useBatchStatus` nor the deposit shows that the user already claimed. The public `Claimed` and `Quit` events do, and [`openBatchIds`](../../reference/sdk/VaultBatcher.md#events) drops a batch once either is emitted for the user. If you store ids yourself, mark the batch done once the claim or quit is mined.

### Canceled

A canceled batch never reached the vault. `useQuit` returns the original amount. Claiming reverts.

## Vault groups

A group deposit joins one batch per member: the chosen vault with the amount, the others with an encrypted zero. Store every `join` the deposit returns, not only the chosen one.

Show the user one entry for the vault they chose, but **claim or quit every join**, the zero legs included. A claim or quit is public, so acting on the chosen vault alone shows which vault the user picked. Read the state of each join's batch with `useBatchStatus`, and offer the action once every leg allows it.

## Checklist

- [ ] The encrypted balance is decrypted only after a click.
- [ ] The send button explains why it is disabled: no amount, above balance, paused.
- [ ] The user's open batches survive a reload: stored ids, or `openBatchIds` over the batcher's logs.
- [ ] After sending, the UI says "queued", not "deposited".
- [ ] Every `BatchState` has a view, enforced by an exhaustive `switch`.
- [ ] Pending batches offer a cancel.
- [ ] Dispatched batches offer `finalize` after a delay you choose, and say when it cancels instead (not on an asynchronous redeem batcher).
- [ ] Finalized batches offer a claim.
- [ ] Canceled batches offer to take the amount back.
- [ ] Claimed and quit batches leave the list.

## Next steps

- [Vault deposits and redemptions](deposits.md) for the SDK calls behind each step.
- [Vault groups](groups.md) when one form deposits into one of several vaults.
