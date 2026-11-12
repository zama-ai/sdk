---
title: Building a vault UI
description: What a vault UI should show and offer on the form, during the send, and in each batch state.
---

# Building a vault UI

A vault deposit lives on after its transaction: it sits in a batch until a keeper settles and claims it (see the [Vaults overview](README.md)). A UI that only covers the form leaves users with funds they cannot see or move. This guide lists what to show and offer at each step, so that no state is missing. The layout is yours.

Redemptions go through the same steps: read "shares" for "assets" and the other way around. The examples use the `STABLE` group from [Vault deposits and redemptions](deposits.md#1-define-a-group).

## The form

| Situation                                      | What to do                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The balance is encrypted                       | Show it as hidden, with a button to decrypt it. The first decryption asks for a signature, so start it from a click. See [`useConfidentialBalance`](../../reference/react/useConfidentialBalance.md). |
| The amount is above the balance                | Disable the button and say why. The SDK checks too, but the user should not learn it from an error.                                                                                                   |
| A batcher of the group is paused               | [`useOpenBatches`](../../reference/react/useOpenBatches.md) returns `paused` for each vault. Disable the button and say joins are paused. See [Paused batchers](advanced.md#paused-batchers).         |
| The user wants to know when the batch closes   | `useOpenBatches` returns each vault's `dispatchableAt`: the earliest time the open batch can be dispatched.                                                                                           |
| A redemption                                   | Label the amount as shares, not assets.                                                                                                                                                               |
| A first redemption from a group of N vaults    | Before the user starts, say the wallet may ask for up to N approvals, then the redemption. See [Wallet prompts](advanced.md#wallet-prompts).                                                          |
| The user holds public tokens, not confidential | Shield first with [`useShield`](../../reference/react/useShield.md).                                                                                                                                  |

## The send

Lock the form while the mutation is pending, so the user cannot send twice. Show "Confirm in your wallet" until `onJoinSubmitted` fires, then "Waiting for the transaction":

```tsx
deposit.mutate({
  group: STABLE,
  vaultId: "beta",
  amount: 1_000_000n,
  onJoinSubmitted: () => setLabel("Waiting for the transaction"),
});
```

When the mutation succeeds, [store the batches](deposits.md#4-store-the-batches) and say the amount is **queued**, not deposited: the user holds no shares yet.

Two errors need their own handling:

- `ChainMismatchError`: the wallet is on another chain. Prompt a network switch.
- [`VaultJoinUnconfirmedError`](../../reference/sdk/errors.md#vaultjoinunconfirmederror): do not offer a plain retry. Handle it as its reference says.

## The batch

Show one entry per join, for the vault the user chose, and read that leg's batch with [`useBatch`](../../reference/react/useBatch.md). Pass the account, so the batch lists `claim` and `quit`. Keep every leg's batch anyway: a cancel must quit them all.

| `state`      | What the user sees                     | What the user can do                         | Hook                                                        |
| ------------ | -------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `pending`    | Queued, with when it can be dispatched | Cancel, to get the amount back               | [`useQuit`](../../reference/react/useQuit.md), on every leg |
| `dispatched` | Processing                             | Wait. If it stays too long, settle it        | [`useFinalize`](../../reference/react/useFinalize.md)       |
| `finalized`  | Ready                                  | Wait for the keeper's claim, or claim now    | [`useClaim`](../../reference/react/useClaim.md)             |
| `canceled`   | Did not go through                     | Wait for the keeper's refund, or get it back | [`useQuit`](../../reference/react/useQuit.md), on every leg |

Offer an action only when `batch.actions` includes it. Switch on `batch.state` exhaustively, so TypeScript flags a state your UI forgets. In the component below, `legs` are the stored `batches` of the join, and `chosen` is the one the user picked:

```tsx
import { useBatch, useClaim, useQuit } from "@zama-fhe/react-sdk/vaults";
import type { BatchRef } from "@zama-fhe/sdk/vaults";
import type { Address } from "viem";

// `Row` and `formatCountdown` stand in for your own components and helpers.

interface DepositRowProps {
  chosen: BatchRef;
  legs: readonly BatchRef[];
  account: Address;
}

function DepositRow({ chosen, legs, account }: DepositRowProps) {
  const { data: batch } = useBatch(chosen, { account });
  const claim = useClaim();
  const quit = useQuit();

  if (!batch) return <Row label="Loading…" />;

  const quitAll = async () => {
    for (const leg of legs) await quit.mutateAsync(leg);
  };

  switch (batch.state) {
    case "pending":
      return (
        <Row
          label={
            batch.nextChangeAt === null
              ? "Queued"
              : `Queued, sent ${formatCountdown(batch.nextChangeAt)} at the earliest`
          }
          action={
            batch.actions.includes("quit") ? { label: "Cancel", onClick: quitAll } : undefined
          }
        />
      );
    case "dispatched":
      return <Row label="Processing" />;
    case "finalized":
      return (
        <Row
          label="Ready"
          action={
            batch.actions.includes("claim")
              ? { label: "Claim now", onClick: () => claim.mutate({ ...chosen, account }) }
              : undefined
          }
        />
      );
    case "canceled":
      return (
        <Row
          label="Did not go through"
          action={
            batch.actions.includes("quit") ? { label: "Get it back", onClick: quitAll } : undefined
          }
        />
      );
    default:
      return batch satisfies never;
  }
}
```

### Pending

`dispatchableAt` is the earliest time anyone may dispatch the batch, not a promise: word it as "at the earliest". After it, a keeper normally dispatches. You can offer [`useDispatch`](../../reference/react/useDispatch.md) as a fallback once `actions` includes `dispatch`.

### Dispatched

A keeper normally settles the batch. If it stays dispatched longer than your app expects, offer `useFinalize`. The delay is yours to pick: the SDK does not decide when a keeper is late.

Past `cancelsAt`, the same `finalize` call **cancels** the batch instead of settling it, so label the button "Cancel and get it back" rather than "Settle". The exception is a redeem batcher whose vault settles redemptions asynchronously: once it has placed its request, `finalize` keeps settling.

### Finalized and canceled

A keeper normally pays the user, so the user often does nothing. `claim` or `quit` stays in `actions` after the payout (see [`Batch`](../../reference/sdk/VaultClient.md#batch)), so decide from the deposit whether to keep the entry:

1. Refetch the batch, for example when the list opens. `useBatch` stops polling once the batch is finalized or canceled, so it does not see a keeper's payout.
2. Decrypt the deposit, together with every other leg's deposit, as the [privacy rules](README.md#a-group-hides-which-vault-you-chose) say.
3. A zero on the chosen leg means paid out: remove the entry.

## Checklist

- [ ] The encrypted balance is decrypted only after a click.
- [ ] The send button says why it is disabled: no amount, above balance, paused.
- [ ] A first multi-vault redemption says how many wallet prompts to expect.
- [ ] Every leg's batch is stored and survives a reload.
- [ ] After sending, the UI says "queued", not "deposited".
- [ ] Every `state` has a view, enforced by an exhaustive `switch`.
- [ ] Actions are offered only when `actions` includes them.
- [ ] A cancel quits every leg of the join.
- [ ] A dispatched batch offers `finalize` after a delay you choose, and says when that cancels.
- [ ] A finalized or canceled entry is refetched, and leaves the list once its deposit decrypts to zero.

## Next steps

- [Vault deposits and redemptions](deposits.md): the SDK calls behind each step
- [`useBatch`](../../reference/react/useBatch.md) and [`Batch`](../../reference/sdk/VaultClient.md#batch): every field of a batch
