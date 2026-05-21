# InGen Confidential Token Quickstart — react-ethers

Next.js 16 example app demonstrating `@zama-fhe/react-sdk` integration with
[ethers v6](https://docs.ethers.org/v6/) on the **T-Rex InGen** private testnet
(chain ID `364301`), backed by the cleartext fhEVM stack deployed in SDK-184.

Forked from `examples/react-ethers` (Sepolia + real relayer) and adapted to use
the `cleartext()` relayer transport against InGen.

Covers: connect wallet, shield ERC-20 → confidential, confidential transfer,
unshield, grant/revoke/use delegation, pending unshield recovery.

## Stack

- **Next.js 16** (App Router, Webpack)
- **React 19** + **ethers v6**
- **TanStack Query v5**
- **@zama-fhe/react-sdk@3.0.0-alpha.41** — `ZamaProvider`, `useShield`, `useConfidentialBalance`, `useUnshield`, `useDelegateDecryption`, etc.
- **@zama-fhe/sdk/ethers** — `createConfig` wires ethers-compatible provider/signer adapters
- **`cleartext()` transport** — no relayer/KMS network, signatures verified by mock keys baked into the SDK

## Setup

```bash
cp .env.example .env.local   # optional — defaults work out of the box
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect MetaMask (or any
EIP-1193 wallet). The app will prompt you to add and switch to the InGen network
on first connection.

## Getting TREX (native gas token)

Use the [InGen faucet](https://faucet.ingen.gateway.fm/) to fund your wallet
with TREX before interacting with the app.

## Network details

| Field           | Value                                |
| --------------- | ------------------------------------ |
| Network name    | InGen                                |
| Chain ID        | `364301`                             |
| RPC URL         | `https://rpc.ingen.t-rex.network`    |
| Explorer        | `https://explorer.ingen.t-rex.network` |
| Native symbol   | `TREX`                               |

## Environment variables

| Variable                     | Required | Description                                                                  |
| ---------------------------- | -------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_INGEN_RPC_URL`  | No       | InGen RPC override. Defaults to `https://rpc.ingen.t-rex.network`.           |

## Deployed contracts on InGen

See `/tmp/sdk-184/deployment-notes.md` for the full address record. The chain
config in `src/providers.tsx` already wires them in — no manual setup needed.

| Contract                     | Address                                      |
| ---------------------------- | -------------------------------------------- |
| ACL                          | `0x09a4710BfBe7B557cD5CFE88BB31e9b5b85C419b` |
| CleartextFHEVMExecutor       | `0x1B05DE5b67b8f8363DC04E3a5996a616f11f8C7B` |
| KMSVerifier                  | `0xd885DEa6a924785fCcdf9CE993FEe27EA11832e6` |
| InputVerifier                | `0x90f05B10db153365D8cB143EA17f5E5714D0bCD5` |
| WrappersRegistry             | `0x7FC3D79EF9d01fA318CF2Aa5D91dDC492383Be0F` |
| USDCMock                     | `0xBBdABB33Cf7Bb427dA1c76f1C59a0786E90EB00b` |
| USDT mock                    | `0x7CC6EB5E82f5ae84BC08cC58734E6aD2c2510068` |
| cUSDC                        | `0x1D0480a22d9ff7DF4dcf94bB70D9B761C358A8a8` |
| cUSDT                        | `0x604fFb6b71bfEe1B155B4093bdCF19a7c7029Efd` |
