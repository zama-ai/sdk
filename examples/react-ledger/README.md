# Sepolia Confidential Tokens — Ledger

Next.js app demonstrating ERC-7984 confidential token operations on **Sepolia** testnet using a **Ledger hardware wallet directly via WebHID** — no MetaMask, no browser extension wallet required.

## Stack

- **Next.js** (App Router)
- **ethers v6** — via `EthersSigner` from `@zama-fhe/sdk/ethers`
- **`LedgerWebHIDProvider`** — custom EIP-1193 provider built on `@ledgerhq/hw-transport-webhid` + `@ledgerhq/hw-app-eth`
- **RelayerWeb** — browser FHE worker, routes through a local Next.js proxy (`/api/relayer`)
- **@tanstack/react-query** — async state management
- **Chain:** Sepolia testnet (chainId 11155111)

## Device compatibility

| Device             | Supported | EIP-712 signing            |
| ------------------ | --------- | -------------------------- |
| Ledger Nano S      | Yes       | Pre-hashed (blind signing) |
| Ledger Nano S Plus | Yes       | Full field display         |
| Ledger Nano X      | Yes       | Full field display         |
| Ledger Stax        | Yes       | Full field display         |
| Ledger Flex        | Yes       | Full field display         |

**Browser requirement:** WebHID is Chromium-only — use Chrome, Edge, or Brave. Firefox and Safari are not supported.

## Features

- **BIP-44 account selector** — choose account index 0–4 (`m/44'/60'/0'/0/n`) before connecting; the selected path is shown in the header after connect.
- **Verify address** — one-click anti-phishing check: calls `getAddress(path, display:true)` so the device screen shows the address for visual confirmation.
- **Disconnect recovery** — device unplug detected via transport `disconnect` event; the app returns to the connect screen automatically and can reconnect without a page reload.
- **Two-tier EIP-712 signing** — `signEIP712Message` (field display, Nano S Plus / X / Stax / Flex) with automatic fallback to `signEIP712HashedMessage` (pre-hashed, Nano S).

## Operations demonstrated

| Operation                    | SDK API                                       |
| ---------------------------- | --------------------------------------------- |
| Decrypt confidential balance | `useConfidentialBalance`                      |
| Shield (ERC-20 → cToken)     | `sdk.createToken().shield()`                  |
| Confidential transfer        | `useConfidentialTransfer`                     |
| Unshield (cToken → ERC-20)   | `useUnshield`                                 |
| Grant decryption access      | `useDelegateDecryption`                       |
| Revoke decryption access     | `useRevokeDelegation`                         |
| Decrypt balance as delegate  | `useDecryptBalanceAs` + `useDelegationStatus` |

> **Shield** uses `token.shield()` directly (via `sdk.createToken()`) rather than the `useShield` hook, with a manual approval step. The spend cap is set to the user's full ERC-20 balance, so subsequent shields within the remaining allowance require only the wrap transaction — no re-approval.

> **Two-tier EIP-712 signing:** the `LedgerWebHIDProvider` tries `signEIP712Message` (full field display, Nano S Plus / Nano X / Stax / Flex) first, then falls back to `signEIP712HashedMessage` (pre-hashed, Nano S) if the device rejects the first call. Auto-detected at runtime — no configuration needed.

> **Separate IndexedDB instances** for `storage` and `sessionStorage` in `ZamaProvider`: both use the same key internally, so sharing a single `IndexedDBStorage` instance causes the session entry to overwrite the encrypted keypair, forcing a re-sign on every balance decryption.

> **High-water mark on `eth_blockNumber`:** monotonically increasing counter that keeps ethers' `PollingBlockSubscriber` firing every poll interval (~4 s) rather than once per block (~12 s on Sepolia), ensuring fast receipt detection after each transaction.

## How it differs from `react-ethers`

|                 | `react-ethers`                          | `react-ledger`                               |
| --------------- | --------------------------------------- | -------------------------------------------- |
| Wallet          | Any EIP-1193 browser extension          | Ledger hardware device (WebHID)              |
| Relayer         | `RelayerWeb` (via `/api/relayer` proxy) | `RelayerWeb` (via `/api/relayer` proxy)      |
| Network         | Sepolia (chainId 11155111)              | Sepolia (chainId 11155111)                   |
| Signing         | Injected wallet (extension)             | hw-app-eth (on-device)                       |
| Chain switching | `wallet_switchEthereumChain`            | Not applicable — chain hardcoded in provider |
| Browser support | Any modern browser                      | Chromium only (WebHID)                       |

## Setup

> **Network:** Sepolia testnet — chainId `11155111`, default RPC `https://ethereum-sepolia-rpc.publicnode.com`.

> **Relayer:** defaults to the public Zama testnet relayer (`https://relayer.testnet.zama.org/v2`) via a local Next.js proxy. No API key required for Sepolia testnet.

> **Gas:** operations require Sepolia ETH. Get some at [sepoliafaucet.com](https://sepoliafaucet.com) or [faucet.alchemy.com/faucets/ethereum-sepolia](https://faucet.alchemy.com/faucets/ethereum-sepolia).

```bash
cp .env.example .env.local
# No changes needed for Sepolia testnet — defaults are pre-configured.
# Set RELAYER_URL + RELAYER_API_KEY in .env.local only if using a private relayer.
# Set NEXT_PUBLIC_SEPOLIA_RPC_URL if you want to use a private RPC endpoint.

npm install
```

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a Chromium-based browser, unlock your Ledger device, open the **Ethereum app**, and click **Connect Ledger**.

## Environment variables

| Variable                      | Required | Default                                       | Description                                                                         |
| ----------------------------- | -------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `RELAYER_URL`                 | No       | `https://relayer.testnet.zama.org/v2`         | Relayer base URL (server-side only). Not required for Sepolia testnet.              |
| `RELAYER_API_KEY`             | No       | —                                             | API key forwarded as `x-api-key` by the proxy. Not required for testnet.            |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | No       | `https://ethereum-sepolia-rpc.publicnode.com` | Override the default Sepolia RPC. Example: `https://sepolia.infura.io/v3/YOUR_KEY`. |

## Sepolia contract addresses

Token pairs are loaded dynamically from the on-chain `WrappersRegistry` at runtime — no hardcoded token addresses needed. Registry address: `0x2f0750Bbb0A246059d80e94c454586a7F27a128e`.

All contracts verified on [sepolia.etherscan.io](https://sepolia.etherscan.io).

## Getting test tokens

Available tokens have a permissionless `mint(address to, uint256 amount)` function.

**Via the app:** click the **Mint** button next to the ERC-20 balance — mints 10 tokens and requires a transaction confirmation on the Ledger device.

**Via Etherscan:** navigate to the ERC-20 contract on [sepolia.etherscan.io](https://sepolia.etherscan.io) → Write Contract → Connect Wallet → call `mint(yourLedgerAddress, amount)`.

## Tests

End-to-end tests (Playwright, no physical device required):

```bash
npx playwright install chromium  # first time only
npm run test:e2e                  # starts the dev server and runs all tests
```

See [WALKTHROUGH.md — Running tests](./WALKTHROUGH.md#running-tests) for full details on the test suites and how the Ledger device is mocked.

For a detailed guide including prerequisites, device setup, step-by-step walkthrough, and troubleshooting, see [WALKTHROUGH.md](./WALKTHROUGH.md).
