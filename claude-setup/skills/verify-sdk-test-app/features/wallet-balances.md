# Wallet balances

The wallet page lists the public ERC-20 balances (USDT, ERC20) in clear and the confidential balances (cUSDT, cERC20) masked as `****`. `Reveal Balances` signs a decryption permit and decrypts the confidential balances; `Hide Balances` masks them again.

## Sub-features

- `wallet-connect` shows the connected burner address and a `Disconnect` button in the sidebar.
- `wallet-public` shows ERC-20 balances in clear, equal to the on-chain `balanceOf`.
- `wallet-masked` shows `****` for every confidential row before reveal.
- `wallet-reveal` decrypts the confidential balances after `Reveal Balances`, passing through `Decrypting...`.
- `wallet-hide` masks the balances again after `Hide Balances`.
- `wallet-cached` shows the revealed balance after a reload without a new decryption round.

## How to get to it (user POV)

- Open the app root `/`. It redirects to `/wallet`.
- Choose `Wallet` in the sidebar.

## Driving it with verify.sh

Preconditions:

- Baseline preconditions from the README. No journey ships for this feature yet; the shield journey covers `wallet-masked` and `wallet-reveal` on the way.

- **Repo spec.** Run `$S run --project=repo tests/reveal.spec.ts`. Seven tests pass; their traces in `artifacts/` show each state.
- **Connect.** Open `/`. The handle `wallet-address` shows `0xf39F...2266` and the URL ends with `/wallet`.
- **Masked.** Read `getByTestId("token-row-cUSDT").getByTestId("balance")`. It reads `****`.
- **Public balance.** Read `getByTestId("token-row-USDT").getByTestId("balance")` and compare it with `formatUnits(await readErc20Balance(contracts.USDT), 6)`. They are equal.
- **Reveal.** Click `getByTestId("reveal-button")` (label `Reveal Balances`). The cUSDT balance changes from `****` to a number, and the button label becomes `Hide Balances`.
- **Hide.** Click `reveal-button` again. Every confidential row reads `****`.
- **Cached reveal.** Reveal, reload the page, wait for `networkidle`, and reveal again. The same number shows within 3 s, from the cache in IndexedDB.
- **Proof.** Save a screenshot and `page.locator("main").ariaSnapshot()` with the revealed table to `journeys/wallet-balances/`.

## Gotchas

- The row handle uses the token symbol (`token-row-cUSDT`) only after metadata has loaded. Before that it is `token-row-<address>`. Wait for the symbol handle.
- The second pair's rows are `token-row-ERC20` and `token-row-cERC20` (the on-chain symbols). The fixture calls the same contracts `USDC` and `cUSDC`; no row has those symbols.
- Navigating away and back resets the reveal: the balances are masked again and need a new click.
- A reveal that stays on `Decrypting...` with no error usually means `contracts/lib/fhevm` does not match the installed `@fhevm/sdk`.
