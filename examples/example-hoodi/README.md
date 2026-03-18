# Hoodi + Cleartext Example

Next.js app demonstrating all four ERC-7984 operations on the **Hoodi** testnet using the **cleartext stack** and **ethers**.

## Stack

- **Next.js** (App Router)
- **ethers v6** — via `EthersSigner` from `@zama-fhe/sdk/ethers`
- **RelayerCleartext** — cleartext FHE backend (no external relayer service required)
- **@tanstack/react-query** — async state management
- Any injected **EIP-1193 wallet** (Rabby, Phantom, …)
- **Chain:** Hoodi testnet (chainId 560048)

## Operations demonstrated

| Operation                    | Hook                      |
| ---------------------------- | ------------------------- |
| Decrypt confidential balance | `useConfidentialBalance`  |
| Shield (ERC-20 → cToken)     | `useShield`               |
| Confidential transfer        | `useConfidentialTransfer` |
| Unshield (cToken → ERC-20)   | `useUnshield`             |

## How it differs from `react-ethers`

|           | `react-ethers`                   | `example-hoodi`                      |
| --------- | -------------------------------- | ------------------------------------ |
| Relayer   | `RelayerWeb` (HTTP, proxy route) | `RelayerCleartext` (no proxy needed) |
| Network   | Mainnet / Sepolia                | Hoodi (chainId 560048)               |
| Auth      | Relayer API key                  | None                                 |
| API route | `/api/relayer/[...path]`         | Not present                          |

`RelayerCleartext` reads plaintext values directly from the on-chain executor contract — no external relayer service is required.

## Setup

> **Network:** Hoodi testnet — chainId `560048`, default RPC `https://rpc.hoodi.ethpandaops.io`.
> Your wallet will be prompted to add the network automatically on first connect.

> **Gas:** Operations require Hoodi ETH. Get some at [hoodi-faucet.pk910.de](https://hoodi-faucet.pk910.de) (proof-of-work, no account required).

```bash
cp .env.example .env.local
# Optional: set NEXT_PUBLIC_HOODI_RPC_URL to a private endpoint (Infura, Alchemy, etc.)
# Leave empty to use the default public Hoodi RPC.

npm install
```

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect your wallet. The app will prompt you to switch to (or add) the Hoodi network automatically.

## Environment variables

| Variable                    | Required | Default                            | Description                                                                                                     |
| --------------------------- | -------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_HOODI_RPC_URL` | No       | `https://rpc.hoodi.ethpandaops.io` | Override the default Hoodi RPC. Example: `https://hoodi.infura.io/v3/YOUR_KEY`. Leaving empty uses the default. |

## Hoodi contract addresses

| Token      | ERC-20                                       | ERC-7984 (cToken / wrapper)                  |
| ---------- | -------------------------------------------- | -------------------------------------------- |
| USDT Mock  | `0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b` | `0x2dEBbe0487Ef921dF4457F9E36eD05Be2df1AC75` |
| Test Token | `0x7740F913dC24D4F9e1A72531372c3170452B2F87` | `0x7B1d59BbCD291DAA59cb6C8C5Bc04de1Afc4Aba1` |

Registry: `0x1807aE2f693F8530DFB126D0eF98F2F2518F292f`

All contracts verified on [hoodi.etherscan.io](https://hoodi.etherscan.io).

## Getting test tokens

Both tokens have a permissionless `mint(address to, uint256 amount)` function.

**Via the app:** click the **Mint** button next to the ERC-20 balance — mints 10 tokens directly to your wallet.

**Via Etherscan:** navigate to the contract on [hoodi.etherscan.io](https://hoodi.etherscan.io) → Write Contract → Connect Wallet → call `mint(yourAddress, amount)`.

**Via code** (amounts are raw integers — use `parseUnits` to convert from human-readable values):

```ts
import { Contract, BrowserProvider, parseUnits } from "ethers";

const MINT_ABI = ["function mint(address to, uint256 amount)"];
const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// USDT Mock — 6 decimals: 10 USDT = parseUnits("10", 6)
const token = new Contract("0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b", MINT_ABI, signer);
await token.mint(await signer.getAddress(), parseUnits("10", 6));
```

For a detailed partner-facing guide including prerequisites, step-by-step flow, and troubleshooting, see [WALKTHROUGH.md](./WALKTHROUGH.md).
