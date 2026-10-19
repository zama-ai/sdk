# Zenith Confidential Token Quickstart — wagmi

Next.js 16 example app demonstrating `@zama-fhe/react-sdk` integration with
[wagmi](https://wagmi.sh/) and [viem](https://viem.sh/) on the **T-Rex Zenith**
testnet (chain ID `936486`), T-Rex's testnet instance on
[Zenith EVM](https://docs.zenith.network/zenith-testnet). The network uses a
cleartext FHEVM stack deployed for this demo.

The example is standalone. It uses the SDK's `cleartext()` transport with the
chain's protocol addresses defined in `src/lib/config.ts`. Those addresses
mirror the `zenithTrexTestnet` preset in `@zama-fhe/sdk/chains`; once this
example pins an SDK release that ships the preset, import it from there instead.

> ℹ️ **Demo / development setup.** This example uses a _cleartext_ FHEVM
> deployment—a lightweight stand-in for the full FHE stack, where values are
> kept in cleartext on-chain rather than encrypted. It is intended for SDK
> integration and end-to-end testing on Zenith, not production use.

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
another injected EIP-1193 wallet. The app can add and switch to Zenith when the
wallet is connected to another network.

Useful checks:

```bash
npm run typecheck
npm run build
```

## Getting CC

CC (Canton Coin) is the native gas token. Use the
[Zenith faucet](https://explorer.testnet.t-rex.zenith.network/faucet) to fund
the connected wallet before submitting transactions (100 CC per address, 30
minute cooldown; gas is a few wei, so one drip lasts).

## Network details

| Field         | Value                                           |
| ------------- | ----------------------------------------------- |
| Network name  | T-Rex Zenith                                    |
| Chain ID      | `936486`                                        |
| RPC URL       | `https://rpc.testnet.t-rex.zenith.network`      |
| Explorer      | `https://explorer.testnet.t-rex.zenith.network` |
| Native symbol | `CC`                                            |

Zenith EVM runs a Reth execution client with block production and finality
mediated by Canton. Blocks are final once included (no reorgs); transactions
that fail Canton validation are dropped without a receipt.

## Environment variables

| Variable                     | Required | Description                                                                  |
| ---------------------------- | -------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_ZENITH_RPC_URL` | No       | Zenith RPC override. Defaults to `https://rpc.testnet.t-rex.zenith.network`. |

## Deployed contracts on Zenith

`src/lib/config.ts` supplies the FHE protocol addresses, while the wrapper
registry supplies the token pairs. No contract addresses need to be copied into
application code. All contracts are verified on the explorer.

| Contract               | Address                                      |
| ---------------------- | -------------------------------------------- |
| ACL                    | `0x061AAc7aAACc98d8e30459d4D858DaB9b6F3bd23` |
| CleartextFHEVMExecutor | `0x6C5036A4ad55DBA8007ae82c4e9C123F143e53ab` |
| KMSVerifier            | `0x85fBA21840059cB7E2E5BB7Fa2c5b2A324Ea7a7D` |
| InputVerifier          | `0xE90965601D10D42D3d88486b47b0Caf12C5C9fDe` |
| WrappersRegistry       | `0xde2e3948d35ef9C406A7317eAF332F3c2786a566` |
| USDC mock              | `0x326335F977D51d5cD877eF9e05A34395C453F29E` |
| USDT mock              | `0x67f2D54c840512f55B74115B536140Ef6dbd7E8B` |
| cUSDC                  | `0x6225bc9CaE9758AB35f240D38E1Ff237A765a88E` |
| cUSDT                  | `0xd5A01a0c1be36203ffa26d6150445c6b11c6B302` |

## Application structure

- `src/providers.tsx` creates the wagmi, TanStack Query, and Zama providers.
- `src/lib/config.ts` defines the EVM chain shown to the wallet and the Zama
  protocol addresses.
- `src/app/page.tsx` owns connection, network, registry, and token-selection
  state, then composes the operation cards.
- `src/components/` contains focused cards for balances, shield, transfer,
  unshield, and delegation.

Token operations use the high-level SDK hooks. The app does not manually
compose ERC-20 approval/wrap calls or the two unshield phases.
