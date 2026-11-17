---
name: verify-sdk-test-app
description: Launch and drive the SDK test dApp (test/test-vite or test/test-nextjs) on a private anvil chain with a burner wallet, the way a user clicks through it, and capture screen plus on-chain evidence. Use to prove that a change to @zama-fhe/sdk, @zama-fhe/react-sdk or test/test-components works in a real browser app (shield, reveal balances, transfer, unshield, permits), not only in unit tests.
---

# Verify the SDK through the test dApp

The SDK is a library, so the surface a user touches is a dApp built on it. This repo ships one for E2E: a React app (`test/test-vite`, or the same pages in `test/test-nextjs`) that renders the shared forms in `test/test-components/src/*.tsx`, which call the `@zama-fhe/react-sdk` hooks. It runs against a private anvil chain with the cleartext FHEVM host stack (values are stored in cleartext, no relayer or KMS) and a burner wallet that signs as anvil account #0 (`0xf39F…2266`).

Everything goes through one helper. Set it once per shell:

```sh
S=.claude/skills/verify-sdk-test-app/scripts/verify.sh   # run from the repo root
```

Not covered by this skill: `examples/*` (standalone npm apps that install the published SDK and mock Sepolia RPC; each has its own `npm run test:e2e`), `examples/node-*`, the daemon (`packages/sdk-daemon`, Docker plus Sepolia, see CONTRIBUTING.md) and the `*-live.spec.ts` lane (real testnet relayer).

## Launch

Preconditions, once per checkout: `pnpm install` has run (it checks out `contracts/lib/fhevm`, installs the soldeer deps and the Playwright browsers), and `anvil`, `forge`, `cast`, `jq` are on `PATH`. The browser is the local Google Chrome, like the repo's own E2E; set `VERIFY_BROWSER_CHANNEL=chromium` to use Playwright's bundled one.

```sh
$S up            # Vite app on :3210, anvil on :8645 (default)
$S up nextjs     # Next.js app on :3110 instead
```

`up` does, in order: rebuild `packages/sdk` and `packages/react-sdk` dist (the apps import dist, not src), start `test/playwright/start-anvil.sh` (anvil plus the forge deploy of the FHEVM host and test tokens at the addresses in `contracts/deployments.json`), start the dev server, then request `/wallet /shield /transfer /unshield /permits` until each returns HTTP 200. Ready is the line `verify: up: …` and exit code 0. A warm start takes about 10 s; a cold forge cache can take minutes.

Options (environment variables): `ANVIL_PORT`, `APP_PORT`, `VERIFY_RUN_ID` (default `default`), `VERIFY_SDK_HOME` (default `$TMPDIR/verify-sdk-test-app`), `VERIFY_SKIP_BUILD=1` (dist is already fresh), `VERIFY_SKIP_DEPS_CHECK=1` (see Gotchas).

Isolation: two instances can run side by side with distinct `VERIFY_RUN_ID`, `ANVIL_PORT` and `APP_PORT`. Only one `next dev` can run per checkout (Next.js locks `test/test-nextjs/.next/dev`), so a second instance, or a parallel `pnpm e2e:test`, must use Vite. `up` refuses a port that is already in use: `start-anvil.sh` does `kill -9` on whatever owns its port, so never point it at a port you did not open.

## Doctor

```sh
$S doctor
```

Read-only. Run it after `up` and whenever anything looks off. It checks that both process groups are alive and own their ports, that anvil answers with chain id 31337, that `erc20`, `cToken`, `USDT`, `cUSDT` and `wrappersRegistry` have code, that `/wallet` serves the page titled `Token SDK Test App`, that SDK dist was built from the current content of `packages/sdk/src` and `packages/react-sdk/src` (otherwise the app runs old SDK code), and whether HEAD moved since `up`. It ends with `doctor: healthy` (exit 0) or `doctor: NOT healthy` (exit 1). `run` refuses to start on an unhealthy instance.

## Drive

```sh
$S run --project=journeys shield            # a journey shipped with this skill
$S run --project=repo tests/transfer.spec.ts  # the repo's own spec, against this instance
$S run --project=repo -g "unshield all"       # any Playwright CLI argument works
```

Write `--project=<name>` with `=`: Playwright reads `--project journeys shield` as two project names. A file filter is a regex on the path, so `shield.spec` also matches `unshield.spec.ts`; use `tests/shield.spec.ts`.

- `journeys` runs `journeys/*.spec.mts` from this skill. Each journey follows a user path from the feature map and writes step evidence. Only `shield` exists so far.
- `repo` runs `test/playwright/tests/*.spec.ts` (node-only and live specs excluded) with evidence capture forced on.

To prove a behavior that no spec covers, add a journey: copy `journeys/shield.journey.spec.mts`, keep its dynamic import of the repo fixtures (`test/playwright/fixtures`), and use these fixtures:

- `page`: before the test, mints 1000 USDT and 1000 USDC to account #0, takes an anvil snapshot, connects the burner wallet and opens `/wallet`. After the test it reverts the snapshot.
- `contracts` (`USDT`, `cUSDT`, `USDC`, `cUSDC`, `wrappersRegistry`, `confidentialReceiver`, `acl`), `account`, `viemClient` (viem test client on this anvil: reads, receipts, `increaseTime`, `mine`), `readErc20Balance(token, owner?)`, `formatUnits`.
- Handles: `data-testid` values from `test/test-components/src/*.tsx` (for example `amount-input`, `shield-button`, `shield-success`, `reveal-button`, `token-row-<SYMBOL>` with a nested `balance`). Sidebar links are `page.getByRole("complementary").getByRole("link", { name: "Shield", exact: true })`.
- Amount inputs take base units (6 decimals: `250000` is 0.25). The wallet table shows formatted values.

The journey file only resolves node built-ins and the fixtures. It cannot import `viem` or `@playwright/test` directly, because it lives outside the `test/playwright` package.

## Evidence

Each `run` writes to `$VERIFY_SDK_HOME/<run-id>/evidence/<YYYYMMDD-HHMMSS>/` (print the root with `$S paths`):

- `run.txt`: command, app URL, git SHA, the `git status --porcelain` lines (the code under test), exit code. `stdout.txt`: the list reporter output.
- `report.json` and `html/` (open it with `test/playwright/node_modules/.bin/playwright show-report <dir>/html`).
- `artifacts/<test>/`: `trace.zip` (every action with DOM before and after), `video.webm`, and the final screenshot, for every test, pass or fail.
- `journeys/<feature>/`: numbered step screenshots, an ARIA snapshot of the end state, and `summary.json` with the tx hash, the receipt status and the before and after balances.

Proof standards:

- Drive the user path: sidebar and wallet-row links, form inputs, buttons. A `page.goto` to a deep URL proves only that entry point. Never call hooks, the SDK or contracts directly to make the UI pass.
- Capture the action and the resulting state: a screenshot before submit, the success line with its tx hash, and the state read back from a second view (a fresh reveal on `/wallet`).
- Check the side effect on chain inside the test (receipt status, ERC-20 balance through `readErc20Balance`). The fixture reverts the chain after each test, so after the run the chain no longer shows it; `summary.json` is the record.
- The cleartext stack and the burner wallet are the repo's own test boundary. Do not add more mocks. The fixture's `relayer-sdk-js` route mock is part of that boundary.
- A failing journey is a finding. Report it with the evidence directory; do not loosen an assertion to make it pass.

## Cleanup

```sh
$S down
```

`down` stops only the two process groups recorded in `$VERIFY_SDK_HOME/<run-id>/state.env` (TERM, then KILL after 10 s). It puts back `contracts/deployments.json` (the deploy drops its final newline) and `test/test-nextjs/next-env.d.ts` (rewritten by `next dev`) when they were clean at `up`, and it deletes the untracked `test/test-nextjs/AGENTS.md` that `next dev` writes, if this run created it. It keeps `logs/` (build, anvil, app) and `evidence/`. Afterwards, `git status --short` shows only your own changes. Never kill by process name or by port: another agent or the developer may run anvil or a dev server too. After a failed `up`, still run `down`.

## Helpers

- `scripts/verify.sh up|build|doctor|run|down|paths`: everything above. It runs on the macOS `/bin/bash` 3.2.
- `playwright.verify.config.mts`: the Playwright config `run` uses. It reads `VERIFY_*` variables and has no imports, because it lives outside the `test/playwright` package.
- `journeys/shield.journey.spec.mts`: the reference journey.
- `features/README.md`: the feature map. Read the matching feature file before you drive a feature.

## Gotchas

- `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` during the build means `node_modules` is behind the lockfile. Run `pnpm install`. If `git log -- pnpm-lock.yaml` shows that the drift is dev tooling only and another process uses this `node_modules`, `VERIFY_SKIP_DEPS_CHECK=1 $S up` builds anyway.
- Next.js 16.4.2 can stop `next dev` once to print a security-upgrade notice addressed to agents. `up` saves the notice to `logs/app.next-security-notice.log` and restarts the server once, which the notice allows. Do not run the `next upgrade` command it suggests. Tell the user about the notice.
- If you edit SDK src while an instance is up, `doctor` fails and `run` refuses. Run `$S build`: it rebuilds dist and records the src it was built from. If a journey still shows the old behavior after that, run `down` and `up` (about 10 s).
- `contracts/lib/fhevm` must match the `@fhevm/sdk` version, or every decrypt hangs with no error (the reveal never leaves `Decrypting...`).
