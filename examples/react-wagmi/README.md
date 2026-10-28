# Confidential Token Quickstart — react-wagmi

Next.js 16 example app demonstrating how to integrate `@zama-fhe/react-sdk` with
[wagmi v3](https://wagmi.sh/) on every network the SDK ships a chain preset for. A network
picker switches the wallet between them; nothing else in the app changes per chain.

Covers: connect wallet (browser wallet, or Privy's wallet modal with WalletConnect for a Safe), pick a network, shield ERC-20 → confidential, confidential transfer, unshield, grant/revoke/use delegation, pending unshield recovery, deposit into a reacting contract (`confidentialTransferAndCall`, Sepolia only).

This app replaces the former `example-bnb`, `example-hoodi`, `example-polygon-amoy` and `example-zenith` apps, which were copies of it pinned to one chain each.

## Networks

| Network                  | Chain ID   | Transport         | Gas token                                                          | Listed when                  |
| ------------------------ | ---------- | ----------------- | ------------------------------------------------------------------ | ---------------------------- |
| Sepolia (default)        | `11155111` | `web()` via proxy | Sepolia ETH, any public faucet                                     | always                       |
| Polygon Amoy             | `80002`    | `web()` via proxy | POL, [faucet](https://faucet.polygon.technology) (select Amoy)     | always                       |
| BNB Testnet · Cleartext  | `97`       | `cleartext()`     | tBNB, [faucet](https://www.bnbchain.org/en/testnet-faucet)         | always                       |
| Hoodi · Cleartext        | `560048`   | `cleartext()`     | Hoodi ETH, [faucet](https://hoodi-faucet.pk910.de)                 | always                       |
| T-Rex Zenith · Cleartext | `936486`   | `cleartext()`     | CC, [faucet](https://explorer.testnet.t-rex.zenith.network/faucet) | always                       |
| Ethereum                 | `1`        | `web()` via proxy | ETH                                                                | `MAINNET_RELAYER_URL` is set |
| Polygon                  | `137`      | `web()` via proxy | POL                                                                | `POLYGON_RELAYER_URL` is set |

The table lives in [`src/lib/networks.ts`](src/lib/networks.ts). Each row pairs a viem chain with the matching preset from `@zama-fhe/sdk/chains` (protocol addresses, registry, public RPC) and a few flags: the transport, the explorer, whether the test tokens can be minted from the app, and the ConfidentialVault demo binding.

**Cleartext rows** run against a _cleartext_ FHEVM deployment: a stand-in for the full FHE stack where the "encrypted" values are stored in cleartext on-chain and there is no relayer or KMS. They exist to integrate and test the SDK on chains without the full protocol. Do not use them for anything real.

**Mainnet rows** are hidden until the server has a relayer URL for them (see [Mainnet access](#mainnet-access)). Nothing points at mainnet by default.

Token pairs on every network come from the on-chain `WrappersRegistry` at runtime; no token addresses are hardcoded. On testnets, the underlying mock tokens expose `mint(address,uint256)`, which the **Mint** button calls.

**Custom environment.** `NEXT_PUBLIC_ZAMA_ENV=custom` swaps the Sepolia row's protocol contracts and gateway for the `NEXT_PUBLIC_ZAMA_*` values in `.env.local` (see `.env.example`): another Zama environment on Sepolia, for example a pre-release one the SDK ships no preset for. Its relayer is set like any other upstream (`SEPOLIA_RELAYER_URL`), and its wrapper registry through `NEXT_PUBLIC_REGISTRY_ADDRESS`, since such an environment usually has none deployed. Same host chain, so it replaces the row rather than adding one.

## Stack

- **Next.js 16** (App Router, Webpack — Turbopack not yet supported with WASM)
- **React 19** + **wagmi v3** + **viem v2**
- **Privy** (optional) — `@privy-io/react-auth` wallet modal (injected wallets + WalletConnect, which is how a Safe pairs from the Safe web app) and `@privy-io/wagmi` to mirror the active Privy wallet into wagmi
- **TanStack Query v5** for async state
- **@zama-fhe/react-sdk** — `ZamaProvider`, `useConfidentialBalance`, `useUnshield`, `useConfidentialTransferAndCall`, `useDelegateDecryption`, etc.
- **@zama-fhe/react-sdk/wagmi** — `createConfig` adapter for wagmi signer/provider wiring
- **@zama-fhe/sdk/web** — browser FHE worker transport via `web()`, routed through the local Next.js proxy (`/api/relayer/<network>`)
- **@zama-fhe/sdk** `cleartext()` — transport for the cleartext deployments, no relayer involved

## Setup

```bash
cp .env.example .env.local
# No changes needed for the testnets — defaults are pre-configured.
# For Privy's wallet modal (WalletConnect, Safe), set NEXT_PUBLIC_PRIVY_APP_ID.

npm install
npm run dev
```

Open [http://localhost:3004](http://localhost:3004) and connect a wallet.

- With `NEXT_PUBLIC_PRIVY_APP_ID` set, **Connect Wallet** opens Privy's wallet modal. Pick a
  browser wallet, or **WalletConnect** to pair a Safe from the Safe web app. The connection is
  wallet-only (no Privy login or SIWE signature).
- Without it, the app connects MetaMask (or any EIP-1193 browser wallet) through wagmi's
  injected connector.

If the wallet is on a chain the app does not support, the app shows a **Choose a Network** screen. A chain that is in the table but that the deployment has no relayer for (mainnet, until you configure one) gets the same screen with a note on how to run the app with a relayer. Picking a network asks the wallet to switch, and to add the chain first if the wallet does not know it (Hoodi and Zenith, typically). The same picker sits above the token selector once connected.

## Mainnet access

Ethereum and Polygon mainnet appear in the picker only when you give the server a relayer for them. The public testnet relayer does not serve mainnet, so a self-run instance has two options:

1. **A Zama relayer API key.** Set `MAINNET_RELAYER_URL=https://relayer.mainnet.zama.org` and `MAINNET_RELAYER_API_KEY` to a key from the [API key request form](https://docs.zama.org/protocol/sdk/guides/relayer-api-keys). Keys are issued after manual review.
2. **A self-hosted relayer.** Set `MAINNET_RELAYER_URL` to your relayer, no key needed. See the [relayer self-hosting guide](https://github.com/zama-ai/fhevm/blob/main/relayer/docs/SELF_HOSTING.md); a relayer needs ETH and $ZAMA on the Gateway chain.

Without one of these the wallet can still connect to mainnet, but the app hides the network, because every encrypt and decrypt request would fail. A wallet that switches to mainnet anyway sees the **Choose a Network** screen with these two options spelled out.

The browser downloads the FHE public key and CRS straight from the storage the relayer's `keyurl` names. The SDK does that from its encrypt worker, which is outside the page's Content Security Policy. When encryption falls back to the page (the worker could not start), the policy applies, and the storage origin has to be in `CSP_CONNECT_SRC` for the download to go through. The relayer owns that address, so the app does not hardcode it; read it from the relayer's answer, for example `curl https://relayer.testnet.zama.org/v2/keyurl`, and set the origin of the URLs it returns.

## Environment variables

All server-side variables are read by the proxy only and never reach the browser.

| Variable                               | Required | Description                                                                                                   |
| -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `MAINNET_RELAYER_URL`                  | No       | Enables Ethereum mainnet. Bare relayer host, no `/v2` suffix. Unset hides the network; there is no fallback.  |
| `MAINNET_RELAYER_API_KEY`              | No       | Added as `x-api-key` by the proxy. Needed for the Zama-hosted mainnet relayer, not for a self-hosted one.     |
| `POLYGON_RELAYER_URL`                  | No       | Same for Polygon mainnet.                                                                                     |
| `POLYGON_RELAYER_API_KEY`              | No       | Same for Polygon mainnet.                                                                                     |
| `SEPOLIA_RELAYER_URL`                  | No       | Defaults to the public testnet relayer `https://relayer.testnet.zama.org`, which needs no key.                |
| `SEPOLIA_RELAYER_API_KEY`              | No       | Only for a private Sepolia relayer.                                                                           |
| `POLYGON_AMOY_RELAYER_URL`             | No       | Defaults to the public testnet relayer.                                                                       |
| `POLYGON_AMOY_RELAYER_API_KEY`         | No       | Only for a private Polygon Amoy relayer.                                                                      |
| `RELAYER_PROXY_ALLOWED_ORIGINS`        | No       | Comma-separated origins allowed to call the proxy. Defaults to the app's own origin.                          |
| `ENABLED_NETWORKS`                     | No       | Comma-separated table keys to offer, e.g. `mainnet,sepolia`. Unset offers every network the server can serve. |
| `CSP_CONNECT_SRC`                      | No       | Comma-separated extra origins for the CSP `connect-src`: the key storage each relayer's `keyurl` names.       |
| `NEXT_PUBLIC_ZAMA_ENV`                 | No       | `custom` swaps the Sepolia row's protocol contracts for the `NEXT_PUBLIC_ZAMA_*` values. Unset = SDK preset.  |
| `NEXT_PUBLIC_ZAMA_*`                   | Custom   | Gateway chain ID and protocol contract addresses of the custom environment. See `.env.example`.               |
| `NEXT_PUBLIC_REGISTRY_ADDRESS`         | Custom   | Wrapper registry of the custom environment, which usually has no registry deployment.                         |
| `NEXT_PUBLIC_PRIVY_APP_ID`             | No       | Privy app ID from the Privy dashboard. Enables the Privy wallet modal; unset = injected connector only.       |
| `NEXT_PUBLIC_COMMIT_SHA`               | No       | Commit shown in the footer. Vercel's `VERCEL_GIT_COMMIT_SHA` is used when this is unset.                      |
| `NEXT_PUBLIC_SOURCE_REPO_URL`          | No       | Repository the footer links to. Defaults to `https://github.com/zama-ai/sdk`; a fork must set its own.        |
| `NEXT_PUBLIC_<NETWORK>_RPC_URL`        | No       | RPC override per network: `SEPOLIA`, `POLYGON_AMOY`, `BNB_TESTNET`, `HOODI`, `ZENITH`, `MAINNET`, `POLYGON`.  |
| `NEXT_PUBLIC_VAULT_ADDRESS`            | No       | `ConfidentialVault` demo address on Sepolia (`confidentialTransferAndCall`).                                  |
| `NEXT_PUBLIC_VAULT_CONFIDENTIAL_TOKEN` | No       | Confidential token the vault is bound to (cUSDC). Vault cards render only when it is selected on Sepolia.     |

Earlier versions of this app, and the per-chain apps it replaces, read `RELAYER_URL`, `RELAYER_API_KEY`, `NEXT_PUBLIC_AMOY_RPC_URL` and `NEXT_PUBLIC_BSC_TESTNET_RPC_URL`. Those names are no longer read: a stale `.env.local` silently falls back to the public testnet relayer, so rename them to the per-network names above.

## Relayer proxy

Relayer traffic for `web()` networks goes through `src/app/api/relayer/[network]/[...path]/route.ts`, following the pattern in the [SDK authentication guide](https://docs.zama.org/protocol/sdk/beta/guides/authentication). The route looks the network up in [`src/lib/relayers.ts`](src/lib/relayers.ts), adds the API key server-side, forwards only the headers the SDK sends and the relayer routes it calls (plus their job polling paths), and:

- returns `404` for a network it has no upstream for (never a default relayer),
- returns `403` when the request's `Origin` is not the app's own (or one in `RELAYER_PROXY_ALLOWED_ORIGINS`),
- never logs request bodies, which carry user addresses and handles.

Rate limiting belongs at the hosting layer; a public deployment that adds its own API key should add it.

`GET /api/networks` returns the networks the server can serve, which is what the picker lists.

## Hosting

The app is built to be hosted as-is, with the user's browser wallet doing all signing and the proxy the only server-side code. What a deployment gets:

- **Security headers.** `src/proxy.ts` sets a per-request Content Security Policy on every page: scripts need the request's nonce, `connect-src` is limited to this origin, the RPCs of the networks in the table and the relayers' key storage, `worker-src 'self' blob:` and `'wasm-unsafe-eval'` are what the FHE runtime needs, and `frame-ancestors 'none'` blocks framing. The policy governs the page and the workers it spawns; the SDK's encrypt worker is a static file with no policy of its own. `next.config.ts` adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS. There are no third-party scripts, fonts or analytics unless Privy is enabled: with `NEXT_PUBLIC_PRIVY_APP_ID` set, the policy additionally allows Privy's iframe and API, WalletConnect's relay and verification iframes, inline wallet icons, and inline styles (Privy's modal injects its own), following [Privy's CSP guidance](https://docs.privy.io/security/implementation-guide/content-security-policy). HSTS covers the app's own host only, so a copy on an apex domain does not pin its subdomains, and the policy does not upgrade `http://` requests, so an RPC override on a private `http://` node keeps working.
- **Mainnet banner.** A wallet on Ethereum or Polygon mainnet sees a banner saying transactions move real funds.
- **Deployed commit in the footer.** The footer links the source repository (`NEXT_PUBLIC_SOURCE_REPO_URL`) and the commit the build was made from (`NEXT_PUBLIC_COMMIT_SHA`, filled from `VERCEL_GIT_COMMIT_SHA` on Vercel), so anyone can check what they are running.
- **Pinned dependencies.** `package.json` pins exact versions and the lockfile is committed; `npm ci` installs exactly what was reviewed.
- **Network subset.** `ENABLED_NETWORKS=mainnet,sepolia` offers only those rows; the proxy refuses the rest. An unknown key stops the server at boot (`src/instrumentation.ts`), so a typo cannot silently hide a network.

To host on Vercel: import the repository, set the root directory to `examples/react-wagmi`, and set `MAINNET_RELAYER_URL`, `MAINNET_RELAYER_API_KEY`, `ENABLED_NETWORKS` and `CSP_CONNECT_SRC` (the key storage of every relayer you serve). Use a relayer key with its own quota, and add a per-IP rate limit on `/api/relayer/*` in the hosting layer (a Vercel Firewall rate-limit rule, say): the origin check stops other sites' pages from using the proxy, not scripted abuse. Deploy from tags rather than from every push.

A `.env.local` on your own machine is enough to run the same app yourself (see [Setup](#setup) and [Mainnet access](#mainnet-access)).

## Adding a network

1. Add a row to `networks` in `src/lib/networks.ts`: the viem chain, the `@zama-fhe/sdk/chains` preset, the transport, the explorer and the flags.
2. For a `relayer` network, add an upstream entry in `src/lib/relayers.ts` (and the env vars it reads).
3. If the suite should cover it, add the chain to `NETWORKS` in `e2e/fixtures.ts`.

## Running e2e tests

```bash
npm run test:e2e        # runs Playwright (starts its own dev server; port 3004 must be free)
```

Tests mock `window.ethereum` and the RPC of the network under test, and abort every relayer request — no wallet or real network required. The suite forces the injected-wallet stack (`NEXT_PUBLIC_PRIVY_APP_ID` cleared), since Privy's modal cannot be driven by a mocked provider. The config enables the Ethereum mainnet row with an unreachable relayer URL so the picker and the mainnet feature flags are covered.

With `CI` set, Playwright builds the app and runs the suite against `next start` instead of the dev server, because the production CSP is stricter than the development one (no `'unsafe-eval'`, no inline styles). `security.spec.ts` checks the headers and that the app loads without a CSP violation; encryption is not exercised, since every relayer call is aborted. `allowlist.spec.ts` covers `ENABLED_NETWORKS` by loading the relayer table in the test process, since the server under test runs with it unset, and with `CI` set it also checks that `next start` refuses to boot on an unknown key.

## Architecture at a glance

See [WALKTHROUGH.md](WALKTHROUGH.md) for a full developer walkthrough.
