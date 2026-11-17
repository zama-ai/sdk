# Shield

Shield turns a public ERC-20 balance into a confidential balance of its wrapper. The user enters an amount and chooses `Shield`; the SDK picks the route (ERC-1363 `transferAndCall`, or approve plus wrap) and the page shows `Shielded successfully! Tx: 0x…`. The form can also approve the wrapper for an explicit amount.

## Sub-features

- `shield-open` opens the `Shield USDT` form from the sidebar and from a wallet row.
- `shield-submit` shields an amount; the ERC-20 balance drops and the decrypted confidential balance rises by the same amount.
- `shield-approve` approves the wrapper for an explicit underlying amount and shows the new allowance.
- `shield-overspend` shows `Error:` and moves nothing when the amount exceeds the ERC-20 balance.
- `shield-usdc` shields the second pair (ERC20 to cERC20).

## How to get to it (user POV)

- Choose `Shield` in the sidebar. The form opens for the default pair USDT to cUSDT.
- On `/wallet`, choose the `Shield` link in a public-token row (`USDT` or `ERC20`).
- Open `/shield?token=<erc20>&wrapper=<confidential token>` directly.

## Driving it with verify.sh

Preconditions:

- Baseline preconditions from the README. The test account holds more USDT than the shield amount.

- **Journey.** Run `$S run --project=journeys shield`. One test passes and `journeys/shield/` holds `0-sidebar-entry.png` to `4-wallet-after.png`, `4-wallet-after.aria.yml` and `summary.json`.
- **Sidebar entry.** Choose `getByRole("complementary").getByRole("link", { name: "Shield", exact: true })`. The URL ends with `/shield` and the heading `Shield USDT` is visible.
- **Wallet-row entry.** On `/wallet`, choose `getByTestId("token-row-USDT").getByRole("link", { name: "Shield" })`. The URL holds `token=<USDT>&wrapper=<cUSDT>` and the heading `Shield USDT` is visible.
- **Submit.** Fill `getByTestId("amount-input")` with `250000` and click `getByTestId("shield-button")`. `shield-success` reads `Shielded successfully! Tx: 0x` and a 64-hex hash.
- **On chain.** Get the receipt of that hash through `viemClient.getTransactionReceipt`. The status is `success`, and `readErc20Balance(contracts.USDT)` is 250000 lower than before.
- **Second view.** Choose `Wallet` in the sidebar and click `reveal-button`. The cUSDT balance is the earlier value plus 0.25, and the USDT row is 0.25 lower.
- **Approve and overspend.** Run `$S run --project=repo tests/shield.spec.ts`. Four tests pass, including `approve-underlying-success` with `Current allowance: 12345` and `shield-error` with `Error:` on overspend.

## Gotchas

- `summary.json` records the receipt's `to`. Do not assert on it: the SDK chooses the route, and the route differs between plain ERC-20 and ERC-1363 tokens.
- `Current allowance:` can read `0` after a successful shield, because the wrap uses the allowance up.
- The page has two links named `Shield` on `/wallet` (one per public row) plus the sidebar link. Scope each locator to its row or to the sidebar.
- `shield-success` stays on screen until the next mutation. Read the tx hash before you submit again.
