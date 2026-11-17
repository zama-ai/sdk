# Unshield

Unshield turns a confidential balance back into the public ERC-20. It is a two-phase flow (an unwrap request, then a finalize after the decryption proof) that the SDK runs as one action. The app also offers unshield of the whole balance and a resume page that finishes phase 2 from a phase-1 tx hash.

## Sub-features

- `unshield-amount` unshields an amount; the decrypted confidential balance drops and the ERC-20 balance rises by the same amount.
- `unshield-all` unshields the whole confidential balance; the decrypted balance becomes `0`.
- `unshield-resume` runs phase 1 only (`Unwrap`), then finishes it with `Resume`; `Resume` is disabled until phase 1 has a tx hash.

## How to get to it (user POV)

- On `/wallet`, choose the `Unshield` link in a confidential row (`cUSDT` or `cERC20`).
- Choose `Unshield`, `Unshield All` or `Resume Unshield` in the sidebar. Each opens for cUSDT.
- Open `/unshield?token=<confidential token>`, `/unshield-all?token=…` or `/resume-unshield?token=…` directly.

## Driving it with verify.sh

Preconditions:

- Baseline preconditions from the README. No journey ships for this feature yet.
- The confidential balance is larger than the amount. Shield first if the test needs a known starting value.

- **Repo specs.** Run `$S run --project=repo tests/unshield.spec.ts tests/unshield-all.spec.ts tests/resume-unshield.spec.ts`. Five tests pass. They open the pages by URL.
- **Wallet-row entry.** On `/wallet`, choose `getByTestId("token-row-cUSDT").getByRole("link", { name: "Unshield" })`. The heading `Unshield cUSDT` is visible and `current-balance` reads `Balance: ` and a number.
- **Unshield an amount.** Fill `amount-input` with `500` and click `unshield-button`. `unshield-success` contains `Tx: 0x`. `readErc20Balance(contracts.USDT)` is 500 higher than before.
- **Second view.** Choose `Wallet` and click `reveal-button`. The cUSDT row is 0.0005 lower.
- **Unshield all.** Choose `Unshield All` in the sidebar and click `unshield-all-button`. `unshield-all-success` contains `Tx: 0x`, and a fresh reveal shows cUSDT `0`.
- **Resume.** Choose `Resume Unshield` in the sidebar. `resume-button` is disabled. Fill `amount-input` with `200` and click `unwrap-button`; `unwrap-tx-hash` shows `0x…` and `resume-button` becomes enabled. Click it. `resume-success` contains `Tx: 0x`, and a fresh reveal is 0.0002 lower.

## Gotchas

- Unshield all and the shield fixture share account #0. Run unshield-all last in a test, or shield again before other checks.
- The `Unshield` link on `/wallet` passes only `token`. The page uses the confidential token as its own wrapper.
- `unwrap-success` alone is only phase 1. The ERC-20 balance moves only after `Resume` or a full `Unshield`.
