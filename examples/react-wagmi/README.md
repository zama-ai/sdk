# Confidential Token Quickstart — react-wagmi

Next.js 16 example app demonstrating how to integrate `@zama-fhe/react-sdk` with
[wagmi v3](https://wagmi.sh/) on every network the SDK ships a chain preset for. A network
picker switches the wallet between them; nothing else in the app changes per chain.

Covers: connect wallet, pick a network, shield ERC-20 → confidential, confidential transfer, unshield, grant/revoke/use delegation, pending unshield recovery, deposit into a reacting contract (`confidentialTransferAndCall`, Sepolia only).

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

## Stack

- **Next.js 16** (App Router, Webpack — Turbopack not yet supported with WASM)
- **React 19** + **wagmi v3** + **viem v2**
- **TanStack Query v5** for async state
- **@zama-fhe/react-sdk** — `ZamaProvider`, `useConfidentialBalance`, `useUnshield`, `useConfidentialTransferAndCall`, `useDelegateDecryption`, etc.
- **@zama-fhe/react-sdk/wagmi** — `createConfig` adapter for wagmi signer/provider wiring
- **@zama-fhe/sdk/web** — browser FHE worker transport via `web()`, routed through the local Next.js proxy (`/api/relayer/<network>`)
- **@zama-fhe/sdk** `cleartext()` — transport for the cleartext deployments, no relayer involved

## Setup

```bash
cp .env.example .env.local
# No changes needed for the testnets — defaults are pre-configured.

npm install
npm run dev
```

Open [http://localhost:3004](http://localhost:3004) and connect MetaMask (or any EIP-1193 wallet).

If the wallet is on a chain the app does not support, the app shows a **Choose a Network** screen. Picking a network asks the wallet to switch, and to add the chain first if the wallet does not know it (Hoodi and Zenith, typically). The same picker sits above the token selector once connected.

## Mainnet access

Ethereum and Polygon mainnet appear in the picker only when you give the server a relayer for them. The public testnet relayer does not serve mainnet, so a self-run instance has two options:

1. **A Zama relayer API key.** Set `MAINNET_RELAYER_URL=https://relayer.mainnet.zama.org` and `MAINNET_RELAYER_API_KEY` to a key from the [API key request form](https://docs.zama.org/protocol/sdk/guides/relayer-api-keys). Keys are issued after manual review.
2. **A self-hosted relayer.** Set `MAINNET_RELAYER_URL` to your relayer, no key needed. See the [relayer self-hosting guide](https://github.com/zama-ai/fhevm/blob/main/relayer/docs/SELF_HOSTING.md); a relayer needs ETH and $ZAMA on the Gateway chain.

Without one of these the wallet can still connect to mainnet, but the app hides the network, because every encrypt and decrypt request would fail.

## Environment variables

All server-side variables are read by the proxy only and never reach the browser.

| Variable                               | Required | Description                                                                                                  |
| -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `MAINNET_RELAYER_URL`                  | No       | Enables Ethereum mainnet. Bare relayer host, no `/v2` suffix. Unset hides the network; there is no fallback. |
| `MAINNET_RELAYER_API_KEY`              | No       | Added as `x-api-key` by the proxy. Needed for the Zama-hosted mainnet relayer, not for a self-hosted one.    |
| `POLYGON_RELAYER_URL`                  | No       | Same for Polygon mainnet.                                                                                    |
| `POLYGON_RELAYER_API_KEY`              | No       | Same for Polygon mainnet.                                                                                    |
| `SEPOLIA_RELAYER_URL`                  | No       | Defaults to the public testnet relayer `https://relayer.testnet.zama.org`, which needs no key.               |
| `SEPOLIA_RELAYER_API_KEY`              | No       | Only for a private Sepolia relayer.                                                                          |
| `POLYGON_AMOY_RELAYER_URL`             | No       | Defaults to the public testnet relayer.                                                                      |
| `POLYGON_AMOY_RELAYER_API_KEY`         | No       | Only for a private Polygon Amoy relayer.                                                                     |
| `RELAYER_PROXY_ALLOWED_ORIGINS`        | No       | Comma-separated origins allowed to call the proxy. Defaults to the app's own origin.                         |
| `NEXT_PUBLIC_<NETWORK>_RPC_URL`        | No       | RPC override per network: `SEPOLIA`, `POLYGON_AMOY`, `BNB_TESTNET`, `HOODI`, `ZENITH`, `MAINNET`, `POLYGON`. |
| `NEXT_PUBLIC_VAULT_ADDRESS`            | No       | `ConfidentialVault` demo address on Sepolia (`confidentialTransferAndCall`).                                 |
| `NEXT_PUBLIC_VAULT_CONFIDENTIAL_TOKEN` | No       | Confidential token the vault is bound to (cUSDC). Vault cards render only when it is selected on Sepolia.    |

## Relayer proxy

Relayer traffic for `web()` networks goes through `src/app/api/relayer/[network]/[...path]/route.ts`, following the pattern in the [SDK authentication guide](https://docs.zama.org/protocol/sdk/beta/guides/authentication). The route looks the network up in [`src/lib/relayers.ts`](src/lib/relayers.ts), adds the API key server-side, forwards only the headers the SDK sends and the relayer routes it calls (plus their job polling paths), and:

- returns `404` for a network it has no upstream for (never a default relayer),
- returns `403` when the request's `Origin` is not the app's own (or one in `RELAYER_PROXY_ALLOWED_ORIGINS`),
- never logs request bodies, which carry user addresses and handles.

Rate limiting belongs at the hosting layer; a public deployment that adds its own API key should add it.

`GET /api/networks` returns the networks the server can serve, which is what the picker lists.

## Adding a network

1. Add a row to `networks` in `src/lib/networks.ts`: the viem chain, the `@zama-fhe/sdk/chains` preset, the transport, the explorer and the flags.
2. For a `relayer` network, add an upstream entry in `src/lib/relayers.ts` (and the env vars it reads).
3. If the suite should cover it, add the chain to `NETWORKS` in `e2e/fixtures.ts`.

## Running e2e tests

```bash
npm run test:e2e        # runs Playwright (starts the dev server automatically)
```

Tests mock `window.ethereum` and the RPC of the network under test, and abort every relayer request — no wallet or real network required. The config enables the Ethereum mainnet row with an unreachable relayer URL so the picker and the mainnet feature flags are covered.

## Architecture at a glance

See [WALKTHROUGH.md](WALKTHROUGH.md) for a full developer walkthrough.
