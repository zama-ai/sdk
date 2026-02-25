# React + viem Example

Next.js 15 app using `@zama-fhe/react-sdk` with viem directly (no wagmi).

## Setup

```bash
cp .env.example .env.local
# Fill in your values

npm install
```

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect your wallet (MetaMask or any injected wallet).

## Stack

- **Next.js 15** (App Router)
- **React 18** + viem
- **@tanstack/react-query** for async state
- **ZamaProvider** + **ViemSigner** — takes `walletClient` + `publicClient` directly

## How it differs from react-wagmi

Instead of wagmi, this example manages wallet connection manually via `window.ethereum` and viem's `createWalletClient`/`createPublicClient`. A custom `WalletContext` provides `connect`/`disconnect`/`address`/`isConnected` so the page component remains identical.

## Authentication

The relayer may require authentication. You can either:

- **Proxy approach**: Run a proxy server that injects auth headers before forwarding to the relayer
- **Direct auth**: Pass an `auth` transport option in the relayer config (see SDK docs)
