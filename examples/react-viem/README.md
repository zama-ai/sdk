# Sepolia Confidential Token Quickstart — react-viem

Next.js 16 example app demonstrating how to integrate `@zama-fhe/react-sdk` with
[viem v2](https://viem.sh/) on Sepolia testnet.

Covers: connect wallet, shield ERC-20 → confidential, confidential transfer, unshield, grant/revoke/use delegation, pending unshield recovery.

## Stack

- **Next.js 16** (App Router, Webpack — Turbopack not yet supported with WASM)
- **React 19** + **viem v2** (`isAddress`, `parseAbi`, `parseUnits`, `formatUnits`, `createPublicClient`, `createWalletClient`)
- **TanStack Query v5** for async state
- **@zama-fhe/react-sdk** — `ZamaProvider`, `useConfidentialBalance`, `useUnshield`, `useDelegateDecryption`, etc.
- **ViemSigner** — wraps viem `walletClient` + `publicClient` for all SDK operations
- **RelayerWeb** — browser FHE worker, routes through a local Next.js proxy (`/api/relayer`)

## Setup

```bash
cp .env.example .env.local
# No changes needed for Sepolia testnet — defaults are pre-configured.
# Set RELAYER_URL + RELAYER_API_KEY in .env.local only if using a private relayer.

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect MetaMask (or any EIP-1193 wallet) on **Sepolia**.

If your wallet is on the wrong network, the app shows a message — switch to Sepolia manually in your wallet.

## Environment variables

| Variable                      | Required | Description                                                                                 |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `RELAYER_URL`                 | No       | Relayer base URL incl. API version path. Defaults to `https://relayer.testnet.zama.org/v2`. |
| `RELAYER_API_KEY`             | No       | API key added as `x-api-key` header by the proxy. Not required for Sepolia testnet.         |
| `RELAYER_ALLOW_PRIVATE_URL`   | No       | Set to `true` only for local/private relayer development URLs.                              |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | No       | Sepolia RPC override. Defaults to the public PublicNode endpoint.                           |

## Running e2e tests

```bash
npm run test:e2e        # runs Playwright (starts the dev server automatically)
```

Tests mock `window.ethereum` and the Sepolia RPC — no wallet or real network required.

## Architecture at a glance

See [WALKTHROUGH.md](WALKTHROUGH.md) for a full developer walkthrough.
