---
title: Building a vault UI
description: The states a vault batch goes through, and what your UI should show and offer in each one.
---

# Building a vault UI

A vault deposit is not done when the transaction is mined. The amount joins a **batch**, the batch is sent to the vault later, and the deposit is claimed after that to pay out the shares. A UI that only covers the deposit form leaves users with funds they cannot see or move.

This guide maps every state of a batch to what your UI shows and offers. It does not prescribe a layout: put the form in a modal, a page or a sidebar, and show deposits in a list, a toast or a notification center. What matters is that no state is missing.

{% hint style="info" %}
Redemptions go through the same states. Read "shares" for "assets" below, and the other way around.
{% endhint %}

The examples use the `STABLE` group from [Vault deposits and redemptions](deposits.md#1-define-a-group).

## The journey

1. **The form.** The user picks a vault and an amount. Your UI checks them before sending.
2. **The send.** One join covers every vault of the group and returns the batch each leg landed in. Your app stores them.
3. **The batch.** `useBatch` reads the chosen vault's batch and returns its `state`, its `actions`, and `nextChangeAt`. Your UI renders the state and offers the actions.

## 1. The form

| Situation                                         | What to do                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The balance is encrypted                          | Show it as hidden, with a button to decrypt it. The first decryption asks the wallet for a signature, so start it from a click. See [`useConfidentialBalance`](../../reference/react/useConfidentialBalance.md). The asset is the group's `asset`, and each vault's share token is its `share`. |
| The amount is above the balance                   | Disable the button and say why. A confidential transfer above the balance moves zero instead of reverting. The SDK checks this before sending, but the user should not find out from an error.                                                                                                  |
| A batcher of the group is paused                  | [`useOpenBatches`](../../reference/react/useOpenBatches.md) returns `paused` for each vault. One paused batcher blocks every join of the group, so disable the button and say joins are paused. Claims and quits still work.                                                                    |
| The user waits to know when the batch closes      | `useOpenBatches` returns each vault's `dispatchableAt`: the earliest time the open batch can be sent.                                                                                                                                                                                           |
| A redemption                                      | The amount is in shares, not assets. Label the field so the user knows which one they type.                                                                                                                                                                                                     |
| A first redemption from a group of N vaults       | Say that the wallet may ask for up to N approvals, then the redemption. See [Wallet prompts](advanced.md#wallet-prompts).                                                                                                                                                                       |
| The user has public tokens, not confidential ones | Shield first with [`useShield`](../../reference/react/useShield.md), then deposit.                                                                                                                                                                                                              |

## 2. The send

[`useDeposit`](../../reference/react/useDeposit.md) and [`useRedeem`](../../reference/react/useRedeem.md) return `batches`: the batch of every leg, decoys included. **Store them** where the user finds them again after a reload or on another device. Without them, your app cannot read, claim or quit the deposit. See [Store the batches](deposits.md#4-store-the-batches).

While the transaction is pending, lock the form so the user cannot send twice. Show "Confirm in your wallet" until the `onJoinSubmitted` callback fires, then "Waiting for the transaction":

```tsx
deposit.mutate({
  group: STABLE,
  vaultId: "beta",
  amount: 1_000_000n,
  onJoinSubmitted: () => setLabel("Waiting for the transaction"),
});
```

If the callback throws, the SDK only logs a warning, so the label stays on "Confirm in your wallet".

After the join is mined, say the amount is **queued**, not deposited. The user does not hold shares yet.

If the mutation fails with `VaultJoinUnconfirmedError`, the transaction was mined but the SDK could not read every batch id from it. Do not offer a plain retry: the deposit most likely went through. Show the transaction hash and ask the user to check it.

A vault page can render before the wallet is on the group's chain, for example before it connects. Reads go to the group's `chainId`, which needs a provider that can read other chains, such as `WagmiProvider`. The mutation hooks throw `ChainMismatchError` while the wallet is on another chain, so prompt a network switch before sending.

## 3. The batch

Read the chosen vault's batch with [`useBatch`](../../reference/react/useBatch.md), and pass the account so the batch lists `claim` and `quit`. It refetches when `nextChangeAt` passes and polls while the batch waits for a dispatch or a settlement, so you need no timer of your own.

| `state`      | What the user sees                                | What the user can do                         | Hook                                                        |
| ------------ | ------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `pending`    | Queued, with the time until the batch can be sent | Cancel, to get the amount back               | [`useQuit`](../../reference/react/useQuit.md), on every leg |
| `dispatched` | Processing                                        | Wait. If it stays here too long, settle it   | [`useFinalize`](../../reference/react/useFinalize.md)       |
| `finalized`  | Ready                                             | Wait for the keeper's claim, or claim now    | [`useClaim`](../../reference/react/useClaim.md)             |
| `canceled`   | Did not go through                                | Wait for the keeper's refund, or get it back | [`useQuit`](../../reference/react/useQuit.md)               |

Offer an action only when `batch.actions` includes it. Switch on `batch.state` and handle every case. With an exhaustive `switch`, TypeScript flags a state your UI forgets:

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

`legs` are the `batches` of the join, and `chosen` is the one whose `vaultId` the user picked. Keep that choice in the user's own storage only.

### Pending

The batch is open. `dispatchableAt` (and `nextChangeAt` until it passes) is the earliest moment anyone may dispatch it: a lower bound, not a promise. Word it as "at the earliest".

Once that time passes, `actions` includes `dispatch`. A keeper (an off-chain service that watches batches) normally dispatches, so you do not have to offer it. If you do, [`useDispatch`](../../reference/react/useDispatch.md) dispatches the batcher's open batch.

`quit` cancels the deposit and refunds the amount. In a group, quit the batch of every leg, one wallet prompt each. Quitting only the chosen leg shows which vault the user picked.

### Dispatched

The batch was sent to the vault and waits for settlement. A keeper normally settles it and the user only waits. `actions` is `["finalize"]`.

If the batch stays here longer than your app expects, offer a button that calls `useFinalize`. Pick the delay yourself; the SDK does not decide when a keeper is late.

`cancelsAt` is the batch's callback deadline, and `nextChangeAt` is set to it while it is in the future. Past it, `finalize` **cancels** the batch instead of settling it, and the user gets the amount back. Label the button accordingly, for example "Cancel and get it back" rather than "Settle". A redeem batcher whose vault settles redemptions asynchronously is an exception: once it has placed its redemption request with the vault, `finalize` keeps settling past the deadline.

### Finalized

The batch settled at `exchangeRate`. A claim pays `deposit * rate / 10 ** decimals`, rounded down. A keeper normally claims for every depositor, so the shares arrive in the user's balance without any action. Offer "Claim now" as a fallback when `claim` is in `actions`. Anyone may claim, and the output always goes to the account, so your backend can also claim for users with [`prepareClaim`](../../reference/sdk/VaultClient.md#prepareclaim).

After a claim, the deposit becomes an encrypted zero, which the SDK cannot tell from a non-zero one without decrypting. So `claim` stays in `actions`. Claiming again is harmless: it moves nothing. Since a keeper may claim without the user doing anything, decrypt the deposit to tell: once the batch is finalized, a deposit that decrypts to zero has been paid out, so remove it from the list. See [Vault groups](#vault-groups) for a group.

### Canceled

The batch did not go through. A keeper normally recovers the deposit for every depositor. The user can also quit to get it back. As with a pending batch, quit every leg of the join. A recovery also leaves an encrypted zero, so a canceled batch whose deposit decrypts to zero has been paid back.

## Vault groups

A join in a group of N vaults has N legs: the chosen vault with the amount, the others with an encrypted zero. Show the user one entry for the vault they chose, and read that leg's batch. Store every leg's batch anyway: a quit must cover them all.

The decoy legs decrypt to zero from the start, so a zero only means "paid out" for the chosen leg. To check it, decrypt the deposit of every leg in one request, not only the chosen one: a lone decryption would tell the relayer which vault the user picked.

## Checklist

- [ ] The encrypted balance is decrypted only after a click.
- [ ] The send button explains why it is disabled: no amount, above balance, paused.
- [ ] A first multi-vault redemption says how many wallet prompts to expect.
- [ ] Every leg's batch is stored and survives a reload.
- [ ] After sending, the UI says "queued", not "deposited".
- [ ] Every `state` has a view, enforced by an exhaustive `switch`.
- [ ] Actions are offered only when `actions` includes them.
- [ ] A cancel quits every leg of the join, not only the chosen one.
- [ ] Dispatched batches offer `finalize` after a delay you choose, and say when it cancels instead.
- [ ] Finalized or canceled batches leave the list once their deposit decrypts to zero, whoever claimed or recovered them.

## Next steps

- [Vault deposits and redemptions](deposits.md) for the SDK calls behind each step
- [Advanced vault integration](advanced.md) for wallet prompts and privacy rules in a group
- [`useBatch`](../../reference/react/useBatch.md) for the full batch type
