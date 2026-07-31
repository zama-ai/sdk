# Polygon Amoy Confidential Token Quickstart

Next.js example app demonstrating ERC-7984 confidential token operations on
**Polygon Amoy** (chain ID `80002`) with **wagmi 3** and **viem 2**, including
on-chain ACL delegation.

Polygon Amoy runs the **full Zama Protocol FHE stack**: real ciphertexts on
chain, a real KMS, and the shared public Zama testnet relayer. This example
therefore uses the `web()` relayer transport (browser FHE worker over HTTP), not
the `cleartext()` stand-in used by the BNB and Hoodi examples.

Covers: connect wallet, shield ERC-20 → confidential, confidential transfer,
unshield, grant/revoke/use delegation, pending unshield recovery.

## Stack

- **Next.js 16** (App Router)
- **React 19**, **wagmi 3**, and **viem 2**
- **TanStack Query 5** for async state
- **`@zama-fhe/react-sdk`**: `ZamaProvider`, `useShield`, `useConfidentialBalance`, `useUnshield`, `useDelegateDecryption`, etc.
- **`@zama-fhe/react-sdk/wagmi`**: adapts wagmi's active connection into the Zama SDK signer
- **`@zama-fhe/sdk/web`**: browser FHE worker transport via `web()`, routed through a local Next.js proxy (`/api/relayer`)
- Any injected **EIP-1193 wallet** (MetaMask, Rabby, Phantom, …)

## The relayer and the local proxy

FHE encryption runs in the browser, but decryption requests and input proofs go
to the Zama relayer over HTTP. The app never calls the relayer directly. Instead
`relayerUrl` in `src/providers.tsx` points at a Next.js route handler
(`src/app/api/relayer/[...path]/route.ts`) which forwards requests upstream.

Two reasons for the proxy:

1. Any `RELAYER_API_KEY` stays server-side and never reaches the browser bundle.
2. The proxy uses a strict header allowlist, so browser cookies and
   `Authorization` headers are never forwarded to the relayer.

The upstream default is `https://relayer.testnet.zama.org`, the shared public
testnet relayer that serves both Sepolia and Polygon Amoy. It is keyless: no API
key is required. Set `RELAYER_URL` and `RELAYER_API_KEY` in `.env.local` only if
you run a private relayer.

## Setup

```bash
cp .env.example .env.local   # optional, defaults work out of the box
npm install
npm run dev
```

Open [http://localhost:3006](http://localhost:3006) and connect any EIP-1193
wallet. The app prompts you to add and switch to Polygon Amoy on first connect.

If your wallet is on the wrong network, the app shows a full-page **Polygon Amoy
Network Required** screen with a **Switch to Polygon Amoy** button.

> **Disconnecting:** wallets manage their own site connections. To fully
> disconnect, use your wallet's "Connected sites" settings.

## Getting POL (native gas token)

All operations require POL, the native currency of Polygon Amoy (not MATIC).
Use the [Polygon faucet](https://faucet.polygon.technology) and select the Amoy
network. Aim for at least a few tenths of a POL: shield and unshield each
involve multiple transactions.

## Network details

| Field         | Value                                         |
| ------------- | --------------------------------------------- |
| Network name  | Polygon Amoy                                  |
| Chain ID      | `80002` (`0x13882`)                           |
| RPC URL       | `https://polygon-amoy-bor-rpc.publicnode.com` |
| Explorer      | `https://amoy.polygonscan.com`                |
| Native symbol | `POL`                                         |
| Faucet        | `https://faucet.polygon.technology`           |

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

> **Shield** uses `useShield`. The SDK owns balance checks, allowance handling (including the USDT-style reset when needed), and wrapper routing. The app passes an exact approval strategy and does not recompose ERC-20 approval and wrapper calls.

> **Wallet lifecycle** is owned by wagmi. `useConnection` exposes the active account and chain; `useConnect` and `useSwitchChain` use their wagmi v3 mutation functions. The app does not install application-owned `accountsChanged` or `chainChanged` listeners.

> **IndexedDB storage** persists SDK transport material and permits. Both configuration fields use the SDK's `indexedDBStorage`; keys are namespaced internally.

## Environment variables

| Variable                   | Required | Default                                       | Description                                                                               |
| -------------------------- | -------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `RELAYER_URL`              | No       | `https://relayer.testnet.zama.org`            | Relayer base URL, no `/v2` suffix. Server-side only.                                      |
| `RELAYER_API_KEY`          | No       | unset                                         | Added by the proxy as an `x-api-key` header. Not required for the public testnet relayer. |
| `NEXT_PUBLIC_AMOY_RPC_URL` | No       | `https://polygon-amoy-bor-rpc.publicnode.com` | Polygon Amoy RPC override, for example `https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY`.  |

Leaving `NEXT_PUBLIC_AMOY_RPC_URL` empty is safe: the app falls back to the
public endpoint automatically.

## Deployed contracts on Polygon Amoy (chain 80002)

The chain config in `src/providers.tsx` already wires these addresses in, so
there is no manual setup. They are reproduced here for reference.

| Contract                                | Address                                      |
| --------------------------------------- | -------------------------------------------- |
| ACL                                     | `0xD99Cb9Fc3c42c87f2A4A12e8Fd60318d6bDdf985` |
| KMSVerifier                             | `0xCD1D89E311bce4C8DEa9a0857a0c9A4E153D4041` |
| InputVerifier                           | `0x6e5A7D8b0c645467Cba7e62D6624917085118631` |
| Decryption verifying contract (EIP-712) | `0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478` |
| Input-verification verifying contract   | `0x483b9dE06E4E4C7D35CCf5837A1668487406D955` |
| ConfidentialTokenWrappersRegistry       | `0xF486c3D4F4562760A43883e72E8D6f6Cf2EFdA94` |

Gateway chain ID: `10901`.

## Registered token pairs

Discovered at runtime from the on-chain registry via `useListPairs`, so no
addresses are hardcoded in the app.

| Token     | ERC-20 (underlying)                          | ERC-7984 (cToken / wrapper)                  | Decimals |
| --------- | -------------------------------------------- | -------------------------------------------- | -------- |
| USDC Mock | `0x8516e725223e3F829537D6A877E1aAE954811B69` | `0x7a1728f2A07cE4D62167dE1348af168509011b7b` | 6        |
| USDT Mock | `0x164F5A056166d8F2ce09FdAc6d040209a8C94d01` | `0x2ABad2203Eba104b52cf040cCcFA100Df15687F8` | 6        |

## Getting test tokens

Both underlying mocks expose a permissionless `mint(address to, uint256 amount)`
function.

**Via the app:** click the **Mint** button next to the ERC-20 balance. It mints
10 whole tokens to your wallet.

**Via PolygonScan:** open the contract on
[amoy.polygonscan.com](https://amoy.polygonscan.com) → Contract → Write Contract
→ Connect to Web3 → call `mint(yourAddress, amount)`. Amounts are raw units, so
`10000000` is 10 tokens at 6 decimals.

**Via code** (amounts are raw integers, use `parseUnits` to convert):

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
  address: "0x8516e725223e3F829537D6A877E1aAE954811B69",
  abi: mintAbi,
  functionName: "mint",
  args: [address!, parseUnits("10", 6)],
});
```

## Tests

```bash
npm run test:e2e          # run all tests (starts the dev server automatically)
npx playwright test --ui  # interactive mode
```

Playwright e2e tests cover the connect flow, the wrong-network screen, the main
UI, and the delegation section. They mock `window.ethereum` and the Polygon Amoy
RPC, and abort every `/api/relayer` request, so no wallet, chain, or relayer is
needed.

## Upgrading

`src/providers.tsx` declares the Polygon Amoy FHE deployment as an inline
`as const satisfies FheChain` literal. Examples are standalone npm projects
pinned to a published `@zama-fhe/sdk` version, and no published version exports a
Polygon Amoy chain preset yet. Once a release ships one, replace the literal
with:

```ts
import { polygonAmoy } from "@zama-fhe/sdk/chains";

const zamaPolygonAmoy = {
  ...polygonAmoy,
  relayerUrl: "http://localhost:3006/api/relayer",
  network: AMOY_RPC_URL,
} as const satisfies FheChain;
```

For a detailed partner-facing guide including prerequisites, step-by-step flow,
and troubleshooting, see [WALKTHROUGH.md](./WALKTHROUGH.md).
