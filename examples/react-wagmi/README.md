# React + wagmi Example

Next.js 15 app using `@zama-fhe/token-react-sdk` with wagmi v2.

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
- **React 18** + wagmi v2
- **@tanstack/react-query** for async state
- **TokenSDKProvider** + **WagmiSigner** — uses wagmi's config for wallet access

## What it does

- Connect/disconnect wallet via wagmi's injected connector
- Display decrypted confidential balance (auto-polling)
- Shield (wrap) public tokens into confidential tokens
- Confidential transfer to another address
- Unshield (unwrap) tokens back to public

## Authentication

The relayer may require authentication. You can either:

- **Proxy approach**: Run a proxy server that injects auth headers before forwarding to the relayer
- **Direct auth**: Pass an `auth` transport option in the relayer config (see SDK docs)
