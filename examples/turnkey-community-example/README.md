# Turnkey × Zama Confidential Tokens Example

Working Next.js example for using Turnkey embedded wallets with the Zama SDK on Ethereum Sepolia or mainnet.

This repo demonstrates the flow implemented in code today:
- `TurnkeyProvider` from `@turnkey/react-wallet-kit` handles authentication
- the app derives a Turnkey-backed viem signer from the authenticated embedded wallet session
- a local `/api/relayer/*` proxy forwards Zama relayer requests
- the app uses `@zama-fhe/react-sdk` with `ZamaProvider`

It validates four core operations:
- shield public ERC-20 into the confidential wrapper
- decrypt confidential balances
- confidential transfer
- unshield back to the public ERC-20

## Requirements

- Node.js 20+
- a Turnkey organization
- a Turnkey Auth Proxy Config ID with Auth Proxy enabled
- a funded wallet on the selected network
- optional Alchemy RPC URL for better reliability than the default public node

## Getting started

Install dependencies:

```bash
npm install
```

Create a local env file:

```bash
cp .env.example .env.local
```

Fill in the required values in `.env.local`, then start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment

The example expects these variables:

- `NEXT_PUBLIC_CHAIN`
  Use `sepolia` or `mainnet`.
- `NEXT_PUBLIC_TURNKEY_ORG_ID`
  Your Turnkey organization ID.
- `NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID`
  Your Turnkey Auth Proxy Config ID. The linked Auth Proxy must be enabled in Turnkey.
- `NEXT_PUBLIC_RPC_URL`
  Optional RPC endpoint. If unset, the app falls back to the network configured in the selected Zama chain preset.
- `ZAMA_RELAYER_API_KEY`
  Optional today on Sepolia, but expected for authenticated relayer access where required.

See [.env.example](./.env.example) for the exact template used by this repo.

## How it works

### Turnkey signer

The app wraps the UI in `TurnkeyProvider`, then uses `useTurnkey()` to access the authenticated Turnkey session and wallet list. It prefers an embedded Turnkey wallet, fetches that wallet's accounts, and exposes the embedded Ethereum account to the Zama SDK through a local viem account adapter and `ViemSigner`.

### Zama relayer proxy

The Zama web relayer is reached through a local Next.js route at `/api/relayer/*`. This keeps the app on same-origin requests and gives one place to add auth headers or relayer policy later if needed.

### Network selection

`NEXT_PUBLIC_CHAIN=mainnet` switches both the Zama preset and the viem chain to Ethereum mainnet. Any other value defaults to Sepolia.

## Notes

- This repo is the runnable companion app for the Turnkey community example. It is intentionally focused on the working integration rather than exhaustive documentation.
- If the authenticated session has no embedded wallet yet, the UI offers a `Create wallet` action and then continues automatically.
- The demo prefers the first embedded Turnkey wallet and the first embedded Ethereum account returned by `fetchWalletAccounts(...)`.
- The demo UI is intentionally minimal and tuned for validation rather than product polish.

## Project structure

- `src/app/page.tsx`: demo UI and confidential token flows
- `src/components/providers.tsx`: Turnkey signer + Zama provider wiring
- `src/lib/chain-config.ts`: Sepolia/mainnet selection
- `src/app/api/relayer/[...path]/route.ts`: relayer proxy
