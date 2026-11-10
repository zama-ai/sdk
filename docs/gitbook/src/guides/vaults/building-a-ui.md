---
title: Building a vault UI
description: The phases a vault position goes through, and what your UI should show and offer in each one.
---

# Building a vault UI

A vault deposit is not done when the transaction is mined. The amount joins a **batch**, the batch is sent to the vault later, and the user exits after that to receive their shares. A UI that only covers the deposit form leaves users with funds they cannot see or move.

This guide maps every phase of a position to what your UI shows and offers. It does not prescribe a layout: put the form in a modal, a page or a sidebar, and show positions in a list, a toast or a notification center. What matters is that no phase is missing.

{% hint style="info" %}
Redemptions go through the same phases. Read "shares" for "assets" below, and the other way around.
{% endhint %}

The examples use the `VAULTS` config from [Vault deposits and redemptions](deposits.md#1-define-your-vaults).

## The journey

1. **The form.** The user picks a vault and an amount. Your UI checks them before sending.
2. **The send.** One join covers every vault of the group and returns a **join record**. Your app stores it.
3. **The position.** `usePosition` reads the record and returns its `phase`, the `availableActions`, and `nextChangeAt`. Your UI renders the phase and offers the actions.

## 1. The form

| Situation                                         | What to do                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The balance is encrypted                          | Show it as hidden, with a button to decrypt it. The first decryption asks the wallet for a signature, so start it from a click. See [`useConfidentialBalance`](../../reference/react/useConfidentialBalance.md). Your app configures the asset and share token addresses; the vault client does not read them. |
| The amount is above the balance                   | Disable the button and say why. A confidential transfer above the balance moves zero instead of reverting. The SDK checks this before sending, but the user should not find out from an error.                                                                                                                 |
| A batcher of the group is paused                  | [`useOpenBatches`](../../reference/react/useOpenBatches.md) returns `paused` for each vault. One paused batcher blocks every join of the group, so disable the button and say joins are paused. Exits still work.                                                                                              |
| The user waits to know when the batch closes      | `useOpenBatches` returns each vault's `dispatchableAt`: the earliest time the open batch can be sent.                                                                                                                                                                                                          |
| A redemption                                      | The amount is in shares, not assets. Label the field so the user knows which one they type.                                                                                                                                                                                                                    |
| A redemption from a group of N vaults             | Say that the wallet may ask for up to N approvals, then the redemption. See [Wallet prompts](groups.md#wallet-prompts).                                                                                                                                                                                        |
| The user has public tokens, not confidential ones | Shield first with [`useShield`](../../reference/react/useShield.md), then deposit.                                                                                                                                                                                                                             |

## 2. The send

[`useDeposit`](../../reference/react/useDeposit.md) and [`useRedeem`](../../reference/react/useRedeem.md) return a join record. **Store it** where the user finds it again after a reload or on another device. Without it, your app cannot read or exit the position. See [Store the join record](deposits.md#4-store-the-join-record).

While the transaction is pending, lock the form so the user cannot send twice. Show "Confirm in your wallet" until the `onJoinSubmitted` callback fires, then "Waiting for the transaction":

```tsx
deposit.mutate({
  groupId: "stable",
  vaultId: "beta",
  amount: 1_000_000n,
  options: { onJoinSubmitted: () => setLabel("Waiting for the transaction") },
});
```

If the callback throws, the SDK only logs a warning, so the label stays on "Confirm in your wallet".

After the join is mined, say the amount is **queued**, not deposited. The user does not hold shares yet.

If the mutation fails with `VaultJoinUnconfirmedError`, the transaction was mined but the SDK could not read every batch id from it. Do not offer a plain retry: the deposit most likely went through. Show the transaction hash and ask the user to check it.

A vault page can render before the wallet is on the vault's chain, for example before it connects. Reads go to the config's `chainId`, which needs a provider that can read other chains, such as `WagmiProvider`. The mutation hooks throw `ChainMismatchError` while the wallet is on another chain, so prompt a network switch before sending.

## 3. The position

Read the position with [`usePosition`](../../reference/react/usePosition.md). It refetches when `nextChangeAt` passes and polls while a batch settles, so you need no timer of your own.

| `phase`    | What the user sees                                | What the user can do                       | Hook                                                  |
| ---------- | ------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| `queued`   | Queued, with the time until the batch can be sent | Cancel, to get the amount back             | [`useExit`](../../reference/react/useExit.md)         |
| `settling` | Processing                                        | Wait. If it stays here too long, settle it | [`useFinalize`](../../reference/react/useFinalize.md) |
| `ready`    | Ready, the shares can be withdrawn                | Withdraw                                   | [`useExit`](../../reference/react/useExit.md)         |
| `closed`   | Done                                              | Nothing. Remove it from the list           | none                                                  |

Offer an action only when `position.availableActions` includes it. Switch on `position.phase` and handle every case. With an exhaustive `switch`, TypeScript flags a phase your UI forgets:

```tsx
import { useExit, usePosition } from "@zama-fhe/react-sdk/vaults";
import type { VaultRecord } from "@zama-fhe/sdk/vaults";
import { VAULTS } from "./vaults";

// `Row` and `formatCountdown` stand in for your own components and helpers.

function PositionRow({ record }: { record: VaultRecord<typeof VAULTS> }) {
  const { data: position } = usePosition(VAULTS, record, { decrypt: true });
  const exit = useExit(VAULTS);

  if (!position) return <Row label="Loading…" />;

  switch (position.phase) {
    case "queued":
      return (
        <Row
          label={
            position.nextChangeAt === null
              ? "Queued"
              : `Queued, sent ${formatCountdown(position.nextChangeAt)} at the earliest`
          }
          action={{ label: "Cancel", onClick: () => exit.mutate(record) }}
        />
      );
    case "settling":
      return <Row label="Processing" />;
    case "ready":
      return (
        <Row label="Ready" action={{ label: "Withdraw", onClick: () => exit.mutate(record) }} />
      );
    case "closed":
      return <Row label="Done" />;
    default:
      return position.phase satisfies never;
  }
}
```

`decrypt: true` decrypts every leg's deposit, which asks the wallet for a signature the first time. Gate it behind a click if the user has not decrypted anything yet in this session.

### Queued

Every batch is waiting for dispatch. `nextChangeAt` is the earliest moment anyone may dispatch one of them: a lower bound, not a promise. Word it as "at the earliest".

Once that time passes, `availableActions` includes `dispatch`. A keeper (an off-chain service that watches batches) normally dispatches, so you do not have to offer it. If you do, [`useDispatch`](../../reference/react/useDispatch.md) dispatches every eligible batch of the join, one wallet prompt each.

`exit` cancels the join and refunds the amount. In a group, it cancels every leg, one wallet prompt each.

### Settling

A batch was dispatched and waits for settlement. A keeper normally settles it and the user only waits. `availableActions` is `["finalize"]`, and `exit` is not possible until the batch settles.

If the position stays here longer than your app expects, offer a button that calls `useFinalize`. Pick the delay yourself; the SDK does not decide when a keeper is late.

Each dispatched leg has a callback deadline, `cancelsAt`, and `nextChangeAt` includes it while it is in the future. Past it, `finalize` **cancels** the batch instead of settling it, and the user gets the amount back on exit. Label the button accordingly, for example "Cancel and get it back" rather than "Settle". A redeem batcher whose vault settles redemptions asynchronously is an exception: once it has placed its redemption request with the vault, `finalize` keeps settling past the deadline.

### Ready

No batch is in flight, and at least one batch has settled or was canceled. `exit` pays out every settled leg and refunds every canceled or pending one. Exiting is a separate transaction: until the user exits, the shares are not in their balance.

In a group, `ready` describes the whole join, not the chosen vault. One leg can be settled while another is still pending. With `decrypt: true`, `position.chosenVaultId` names the chosen vault, and its leg in `position.legs` tells you what an exit does for the user:

| Chosen leg `state` | What exit does for the user    | Suggested label |
| ------------------ | ------------------------------ | --------------- |
| `finalized`        | Pays out the shares            | "Withdraw"      |
| `canceled`         | Refunds the amount             | "Get it back"   |
| `pending`          | Cancels and refunds the amount | "Cancel"        |

Exiting is permissionless once no leg is pending: the payout always goes to the account that joined, never to the caller. So your backend can also exit on the user's behalf with [`prepareExit`](../../reference/sdk/VaultClient.md#prepareexit).

### Closed

The position was exited. Only a read with `decrypt: true` reports `closed`. Without it, an exited position still reads `ready`, with `exit` available, because an exit replaces each deposit with an encrypted zero. Exiting again is harmless: it moves nothing.

If you read without `decrypt`, mark the record as done in your own storage once the exit is mined, and hide it from the list.

## Vault groups

A join in a group of N vaults has N legs: the chosen vault with the amount, the others with an encrypted zero. Show the user one entry for the vault they chose, but always act on the whole record. The hooks take the record, so they always cover every leg. Never build a record with fewer legs: the client rejects it, and acting on the chosen vault alone would show which vault the user picked.

## Checklist

- [ ] The encrypted balance is decrypted only after a click.
- [ ] The send button explains why it is disabled: no amount, above balance, paused.
- [ ] A multi-vault redemption says how many wallet prompts to expect.
- [ ] Every join record is stored and survives a reload.
- [ ] After sending, the UI says "queued", not "deposited".
- [ ] Every `phase` has a view, enforced by an exhaustive `switch`.
- [ ] Actions are offered only when `availableActions` includes them.
- [ ] Settling positions offer `finalize` after a delay you choose, and say when it cancels instead.
- [ ] Ready positions say whether exit pays out or refunds.
- [ ] Exited positions leave the list: `closed`, or marked done in your storage.

## Next steps

- [Vault deposits and redemptions](deposits.md) for the SDK calls behind each step
- [Vault groups](groups.md) for wallet prompts and privacy rules in a group
- [`usePosition`](../../reference/react/usePosition.md) for the full position type
