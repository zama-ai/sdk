# InGen Confidential Token Quickstart — wagmi

Next.js 16 example app demonstrating `@zama-fhe/react-sdk` integration with
[wagmi](https://wagmi.sh/) and [viem](https://viem.sh/) on the **T-Rex InGen**
private testnet (chain ID `364301`). The network uses a cleartext FHEVM stack
deployed for this demo.

The example is adapted from the other React token examples but remains
standalone. It uses the SDK's `cleartext()` transport and built-in
`ingenTestnet` chain preset.

> ℹ️ **Demo / development setup.** This example uses a _cleartext_ FHEVM
> deployment—a lightweight stand-in for the full FHE stack, where values are
> kept in cleartext on-chain rather than encrypted. It is intended for SDK
> integration and end-to-end testing on InGen, not production use.

It covers wallet connection, shielding ERC-20 tokens, confidential transfers,
unshielding, granting/revoking/using decryption delegation, and pending
unshield recovery.

## Stack

- **Next.js 16** with the App Router
- **React 19**
- **wagmi 3** for injected-wallet connection and chain state
- **viem 2** for EVM types and utilities
- **TanStack Query 5**
- **`@zama-fhe/react-sdk`** — `ZamaProvider`, `useShield`,
  `useConfidentialBalance`, `useUnshield`, `useDelegateDecryption`, and the
  other token hooks
- **`@zama-fhe/react-sdk/wagmi`** — adapts the active wagmi connection into the
  Zama SDK signer
- **`@zama-fhe/sdk/chains`** — supplies the `ingenTestnet` protocol addresses
- **`cleartext()`** — runs without relayer or KMS services; the cleartext
  deployment handles the demo flow on-chain

The app uses wagmi v3's `useConnection`. `useConnect` and `useSwitchChain`
expose their actions through TanStack mutation `mutate` functions, so the app
does not own EIP-1193 account or chain listeners.

## Setup

```bash
cp .env.example .env.local   # optional; the checked-in defaults work
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect MetaMask or
another injected EIP-1193 wallet. The app can add and switch to InGen when the
wallet is connected to another network.

Useful checks:

```bash
npm run typecheck
npm run build
```

## Getting TREX

TREX is the native gas token. Use the
[InGen faucet](https://faucet.ingen.gateway.fm/) to fund the connected wallet
before submitting transactions.

## Network details

| Field         | Value                                  |
| ------------- | -------------------------------------- |
| Network name  | T-Rex InGen                            |
| Chain ID      | `364301`                               |
| RPC URL       | `https://rpc.ingen.t-rex.network`      |
| Explorer      | `https://explorer.ingen.t-rex.network` |
| Native symbol | `TREX`                                 |

## Environment variables

| Variable                    | Required | Description                                                        |
| --------------------------- | -------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_INGEN_RPC_URL` | No       | InGen RPC override. Defaults to `https://rpc.ingen.t-rex.network`. |

## Deployed contracts on InGen

`ingenTestnet` from `@zama-fhe/sdk/chains` supplies the FHE protocol addresses,
while the wrapper registry supplies the token pairs. No contract addresses need
to be copied into application code.

| Contract               | Address                                      |
| ---------------------- | -------------------------------------------- |
| ACL                    | `0x09a4710BfBe7B557cD5CFE88BB31e9b5b85C419b` |
| CleartextFHEVMExecutor | `0x1B05DE5b67b8f8363DC04E3a5996a616f11f8C7B` |
| KMSVerifier            | `0xd885DEa6a924785fCcdf9CE993FEe27EA11832e6` |
| InputVerifier          | `0x90f05B10db153365D8cB143EA17f5E5714D0bCD5` |
| WrappersRegistry       | `0x7FC3D79EF9d01fA318CF2Aa5D91dDC492383Be0F` |
| USDCMock               | `0xBBdABB33Cf7Bb427dA1c76f1C59a0786E90EB00b` |
| USDT mock              | `0x7CC6EB5E82f5ae84BC08cC58734E6aD2c2510068` |
| cUSDC                  | `0x1D0480a22d9ff7DF4dcf94bB70D9B761C358A8a8` |
| cUSDT                  | `0x604fFb6b71bfEe1B155B4093bdCF19a7c7029Efd` |

## Application structure

- `src/providers.tsx` creates the wagmi, TanStack Query, and Zama providers.
- `src/lib/config.ts` defines the EVM chain shown to the wallet.
- `src/app/page.tsx` owns connection, network, registry, and token-selection
  state, then composes the operation cards.
- `src/components/` contains focused cards for balances, shield, transfer,
  unshield, and delegation.

Token operations use the high-level SDK hooks. The app does not manually
compose ERC-20 approval/wrap calls or the two unshield phases.
