# Example Hoodi app with cleartext Zama Protocol support

Next.js app demonstrating ERC-7984 confidential token operations on the **Hoodi** testnet with **wagmi 3** and **viem 2** — including on-chain ACL delegation.

## Cleartext Zama Protocol

[Zama Protocol](https://docs.zama.org/protocol) is currently supported officially on Ethereum mainnet and Sepolia testnet. This setup uses a co-processor model to offload FHE computation from the host chain to a decentralised network.

To provide support for yet-unsupported testnets, such as Hoodi, this example app simulates Zama Protocol using a **cleartext stack**. Essentially, it uses mocked FHE contracts to provide an API-compatible surface to write the values to the host chain, without needing an actual co-processor or relayer support to be added by Zama Protocol.

This mode allows developers to test **smart contracts** and **app/backend integrations** with Hoodi chain in an API-compatible fashion with the real Zama Protocol.

**WARNING**: Support for testnets such as Hoodi via this cleartext Zama Protocol method is only intended for **testing** purposes. A **the "encrypted" values are stored in cleartext** on Hoodi testnet.

## Stack

- **Next.js** (App Router)
- **wagmi 3** — injected-wallet connection and chain lifecycle
- **viem 2** — EVM types and utilities
- **`@zama-fhe/react-sdk/wagmi`** — Zama signer adapter for the active wagmi connection
- **`cleartext()`** — cleartext FHE backend (no external relayer service required)
- **@tanstack/react-query** — async state management
- Any injected **EIP-1193 wallet** (Rabby, Phantom, …)
- **Chain:** Hoodi testnet (chainId 560048)

## Operations demonstrated

| Operation                    | SDK API                                       |
| ---------------------------- | --------------------------------------------- |
| Decrypt confidential balance | `useConfidentialBalance`                      |
| Shield (ERC-20 → cToken)     | `useShield`                                   |
| Confidential transfer        | `useConfidentialTransfer`                     |
| Unshield (cToken → ERC-20)   | `useUnshield`                                 |
| Grant decryption access      | `useDelegateDecryption`                       |
| Revoke decryption access     | `useRevokeDelegation`                         |
| Decrypt balance as delegate  | `useDecryptBalanceAs` + `useDelegationStatus` |

> **Shield** uses `useShield`. The SDK owns balance checks, allowance handling—including USDT-style reset when needed—and wrapper routing. The app passes an exact approval strategy and does not recompose ERC-20 approval and wrapper calls.

> **Wallet lifecycle** is owned by wagmi. `useConnection` exposes the active account and chain; `useConnect` and `useSwitchChain` use their wagmi v3 mutation functions. The app does not install application-owned `accountsChanged` or `chainChanged` listeners.

> **IndexedDB storage** persists SDK transport material and permits. Both configuration fields use the SDK's `indexedDBStorage`; keys are namespaced internally.

> **Delegation revocation cache:** `useDecryptBalanceAs` caches decrypted values in IndexedDB keyed by `(token, owner, handle)`. When delegation is revoked, the cached plaintext is still served until the owner's balance changes (via shield, transfer, or unshield), which produces a new on-chain handle and invalidates the cache entry. No TTL is applied — the handle itself is the cache key.

## How it differs from `react-wagmi`

|           | `react-wagmi`                    | `example-hoodi`                 |
| --------- | -------------------------------- | ------------------------------- |
| Relayer   | Web transport (HTTP proxy route) | `cleartext()` (no proxy needed) |
| Network   | Sepolia                          | Hoodi (chainId 560048)          |
| Auth      | Relayer configuration            | None                            |
| API route | `/api/relayer/[...path]`         | Not present                     |

`cleartext()` reads plaintext values directly from the on-chain executor contract—no external relayer service is required.

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

> **Disconnecting:** wallets manage their own site connections. To fully disconnect, use your wallet's "Connected sites" settings (e.g. MetaMask → ⋮ → Connected sites → disconnect).

## Tests

```bash
npm run test:e2e          # run all tests (starts dev server automatically)
npx playwright test --ui  # interactive mode — watch tests run in the browser
```

Playwright e2e tests covering the connect flow, wrong-network screen, main UI, and delegation section (no real wallet or transactions required — uses a mocked EIP-1193 provider).

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
import { parseUnits } from "viem";
import { useConnection, useWriteContract } from "wagmi";

const mintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const { address } = useConnection();
const { mutate: writeContract } = useWriteContract();

writeContract({
  address: "0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b",
  abi: mintAbi,
  functionName: "mint",
  args: [address!, parseUnits("10", 6)],
});
```

For a detailed partner-facing guide including prerequisites, step-by-step flow, and troubleshooting, see [WALKTHROUGH.md](./WALKTHROUGH.md).
