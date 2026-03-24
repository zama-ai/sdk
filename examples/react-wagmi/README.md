# React + wagmi Example

Next.js app using `@zama-fhe/react-sdk` with wagmi v3 on Sepolia testnet.

See [WALKTHROUGH.md](./WALKTHROUGH.md) for a detailed developer guide.

## Setup

```bash
cp .env.example .env.local   # all values are optional — defaults work for testnet
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect your wallet.

## Stack

- **Next.js** (App Router, `"use client"`)
- **React 19** + **wagmi v3** + **viem v2**
- **@tanstack/react-query** for async state
- **ZamaProvider** + **WagmiSigner** — wallet reactivity via wagmi's `watchConnection`
- **RelayerWeb** + local `/api/relayer` proxy (keeps `RELAYER_API_KEY` server-side)

## What it does

- Connect wallet via `useConnect({ connector: injected() })` — no manual `eth_accounts` polling
- Prompt chain switch to Sepolia if needed via `useSwitchChain`
- Shield ERC-20 tokens into confidential tokens (with USDT-style approval handling)
- Confidential transfer to another address
- Unshield confidential tokens back to ERC-20 (two-phase, with pending recovery)
- Delegate / revoke / decrypt-as flows for ERC-7984 delegated decryption
