# SDK test dApp verification map

This directory is the maintained source for verifying what a dApp user sees when it is built on `@zama-fhe/react-sdk`. Read this index before driving the app, then use the matching feature file as the recipe. `S` is `.claude/skills/verify-sdk-test-app/scripts/verify.sh`, run from the repo root.

## Baseline preconditions

- `$S up` (Vite, `http://localhost:3210`) or `$S up nextjs` (`http://localhost:3110`) has printed `verify: up:` for your `VERIFY_RUN_ID`.
- `$S doctor` ends with `doctor: healthy`.
- The test `page` fixture has connected the burner wallet: the sidebar shows `0xf39F...2266` and a `Disconnect` button.
- Account #0 holds at least 1000 USDT and 1000 USDC (minted before each test) and 1000 cUSDT and 1000 cERC20 (from the deploy).
- Never drive an instance that this run did not start.

## Driving conventions

- Start every recipe on `/wallet` with balances masked (`****`).
- Prefer sidebar links by accessible name inside `getByRole("complementary")`, then `data-testid` handles from `test/test-components/src/*.tsx`. Do not use DOM position.
- Amount inputs take base units (6 decimals). The wallet table shows formatted units.
- Each test starts from a chain snapshot and is reverted after it. Assert on-chain effects inside the test.
- `$S run --project=journeys <name>` runs a shipped journey. `$S run --project=repo tests/<file>.spec.ts` runs the repo spec.

## Proof and skip reporting

- Capture the user action and the resulting state: a screenshot before submit, the success line with its tx hash, and a fresh reveal on `/wallet`.
- Each on-chain mutation is proven by its receipt status and by a balance read through `readErc20Balance` or a decrypted balance on a second view.
- Record the feature ID, the entry point, the app (`vite` or `nextjs`) and the evidence directory with each proof.
- A repo spec that uses `page.goto` on a deep URL proves the URL entry point only. Do not report a sidebar or wallet-row entry point as verified through it.
- Report an unreachable path with the attempted command and the unmet precondition.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify.sh` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command or handle and the observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Wallet balances](./wallet-balances.md) covers connection, masked balances, reveal through decryption, hide, and the cached reveal after reload.
- [Shield](./shield.md) covers public ERC-20 to confidential from the sidebar, the wallet row and a URL, plus approve and the overspend error. Has a journey.
- [Confidential transfer](./transfer.md) covers sending a confidential amount, the silent zero transfer on overspend, and the malformed-recipient error.
- [Unshield](./unshield.md) covers confidential to public ERC-20 for an amount, for the whole balance, and resumed from a phase-1 tx hash.
- [Permits](./permits.md) covers the decryption permit status, allow, revoke, revoke all, and clear credentials.

Not mapped yet (sidebar pages with repo specs): Transfer & Call, Approve (operators), Transfer From, Allow All, Wrapper Discovery, Encrypt, Manual Unwrap, Manual Wrap, Decrypt, Registry, Suspense; URL-only pages: `/delegation`, `/delegation-status`, `/token-metadata`, `/offload`.
