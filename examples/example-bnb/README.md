# BNB Confidential Token Quickstart

Next.js 16 example app demonstrating `@zama-fhe/react-sdk` integration with
[ethers v6](https://docs.ethers.org/v6/) on **BNB Smart Chain Testnet**
(chain ID `97`), backed by a cleartext FHEVM stack deployed for this demo.

Uses the `cleartext()` relayer transport — there is no real relayer/KMS network
on this chain.

> ℹ️ **Demo / development setup.** This example uses a _cleartext_ FHEVM deployment — a lightweight
> stand-in for the full FHE stack, where values are kept in cleartext on-chain rather than encrypted.
> It's designed for exploring and integrating the Zama SDK end-to-end on BNB Smart Chain Testnet, and
> isn't intended for production use.

Covers: connect wallet, shield ERC-20 → confidential, confidential transfer,
unshield, grant/revoke/use delegation, pending unshield recovery.

## Stack

- **Next.js 16** (App Router, Webpack)
- **React 19** + **ethers v6**
- **TanStack Query v5**
- **@zama-fhe/react-sdk@3.0.0-alpha.34** — `ZamaProvider`, `useShield`, `useConfidentialBalance`, `useUnshield`, `useDelegateDecryption`, etc.
- **@zama-fhe/sdk/ethers** — `createConfig` wires ethers-compatible provider/signer adapters
- **`cleartext()` transport** — no relayer/KMS network, signatures verified by mock keys baked into the SDK

## Setup

```bash
cp .env.example .env.local   # optional — defaults work out of the box
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect Trust Wallet (or any
EIP-1193 wallet). The app will prompt you to add and switch to the BNB Smart
Chain Testnet on first connection.

## Getting tBNB (native gas token)

Use the [BNB Chain testnet faucet](https://www.bnbchain.org/en/testnet-faucet)
to fund your wallet with tBNB before interacting with the app.

## Network details

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| Network name  | BNB Smart Chain Testnet                  |
| Chain ID      | `97`                                     |
| RPC URL       | `https://bsc-testnet-rpc.publicnode.com` |
| Explorer      | `https://testnet.bscscan.com`            |
| Native symbol | `tBNB`                                   |

## Environment variables

| Variable                  | Required | Description                                                                     |
| ------------------------- | -------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_BSC_TESTNET_RPC_URL` | No       | BNB Smart Chain Testnet RPC override. Defaults to `https://bsc-testnet-rpc.publicnode.com`. |

## Deployed contracts on BNB Smart Chain Testnet (chain 97)

The chain config in `src/providers.tsx` already wires these addresses in — no
manual setup needed. They are reproduced here for reference.

| Contract               | Address                                      |
| ---------------------- | -------------------------------------------- |
| ACL                    | `0x52470e945521E247Cb4754088a836Dc4b838AFBE` |
| CleartextFHEVMExecutor | `0x5985e48689550c1b2893ABfBbe4cc0eE3A22cc54` |
| KMSVerifier            | `0x788F5BB2d93aB4Cb67Fe2277757aE95006504F6F` |
| InputVerifier          | `0x49e0BAB39904E4192c30CFB58573Cbe27B7E398E` |
| WrappersRegistry       | `0xc0E8B73b1C58D846e1d4f8fAE2E1466C85BCeAeC` |
| USDC mock              | `0x1b3BC224c233D38Db8A92DA3fC44d01A9232b64c` |
| USDT mock              | `0xaA3E4C4db8D44711B6fc0E4ffdCBb3749C1A3A72` |
| cUSDC                  | `0xbb9Ac1000B79a035B7Aa933cf6E44B51a2f6222a` |
| cUSDT                  | `0x8278F319597d67bb72f6e2d3119F1970FBE86Dc8` |
