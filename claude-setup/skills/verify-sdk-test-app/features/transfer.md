# Confidential transfer

Confidential transfer sends an encrypted amount of a confidential token to another address. The form shows the sender's decrypted balance, takes a recipient and an amount, and shows `Tx: 0x…` on success. An amount above the balance does not fail: the token transfers an encrypted zero, so a failure does not leak the balance.

## Sub-features

- `transfer-open` opens the form for cUSDT with the decrypted balance as `Balance: <base units>`.
- `transfer-send` sends an amount; the sender's decrypted balance drops by that amount and the public ERC-20 balance does not change.
- `transfer-overspend` succeeds with a tx hash and leaves the balance unchanged.
- `transfer-bad-recipient` shows `Error:` for a malformed address and sends nothing.

## How to get to it (user POV)

- Choose `Transfer` in the sidebar. The form opens for cUSDT.
- Open `/transfer?token=<confidential token>` directly.

## Driving it with verify.sh

Preconditions:

- Baseline preconditions from the README. No journey ships for this feature yet.
- The recipient is anvil account #1, `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`.

- **Repo spec.** Run `$S run --project=repo tests/transfer.spec.ts`. Four tests pass. They open the form by URL, so they prove the URL entry point only.
- **Sidebar entry.** Choose `getByRole("complementary").getByRole("link", { name: "Transfer", exact: true })`. The heading `Transfer cUSDT` is visible and `current-balance` reads `Balance: ` and a number.
- **Send.** Fill `recipient-input` with account #1, fill `amount-input` with `500`, and click `transfer-button`. `transfer-success` contains `Tx: 0x`.
- **Second view.** Choose `Wallet`, then click `reveal-button`. The cUSDT row is 0.0005 lower than before, and `readErc20Balance(contracts.USDT)` is unchanged.
- **Overspend.** Send the current balance plus `1000`. `transfer-success` contains `Tx: 0x`, and a fresh reveal shows the unchanged balance.
- **Bad recipient.** Fill `recipient-input` with `0xnot-a-valid-address` and send `100`. `transfer-error` contains `Error:` and `transfer-success` is not visible.

## Gotchas

- `Exact: true` matters: the sidebar also has `Transfer & Call` and `Transfer From`.
- The form passes `skipBalanceCheck: true`, so the overspend case reaches the chain on purpose. A pre-flight balance error here is a regression.
- A success line alone does not prove that value moved, because an overspend also succeeds. Always reveal the balance on `/wallet` afterwards.
