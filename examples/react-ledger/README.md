# Hoodi Confidential Tokens — Ledger

Next.js app demonstrating ERC-7984 confidential token operations on the **Hoodi** testnet using a **Ledger hardware wallet directly via WebHID** — no MetaMask, no browser extension wallet required.

## Cleartext Zama Protocol

[Zama Protocol](https://docs.zama.org/protocol) is currently supported officially on Ethereum mainnet and Sepolia testnet. This setup uses a co-processor model to offload FHE computation from the host chain to a decentralised network.

To provide support for yet-unsupported testnets such as Hoodi, this example uses the **cleartext stack**. It uses mocked FHE contracts to provide an API-compatible surface without needing an actual co-processor or relayer — "encrypted" values are stored as plaintexts on Hoodi testnet.

**WARNING**: Support for testnets such as Hoodi via this cleartext method is only intended for **testing** purposes. Values are **not** actually encrypted on Hoodi testnet.

## Stack

- **Next.js** (App Router)
- **ethers v6** — via `EthersSigner` from `@zama-fhe/sdk/ethers`
- **`LedgerWebHIDProvider`** — custom EIP-1193 provider built on `@ledgerhq/hw-transport-webhid` + `@ledgerhq/hw-app-eth`
- **RelayerCleartext** — cleartext FHE backend (no external relayer service required)
- **@tanstack/react-query** — async state management
- **Chain:** Hoodi testnet (chainId 560048)

## Device compatibility

| Device             | Supported | EIP-712 signing                |
| ------------------ | --------- | ------------------------------ |
| Ledger Nano S      | Yes       | Pre-hashed (blind signing)     |
| Ledger Nano S Plus | Yes       | Full field display             |
| Ledger Nano X      | Yes       | Full field display             |
| Ledger Stax        | Yes       | Full field display             |
| Ledger Flex        | Yes       | Full field display             |

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

> **High-water mark on `eth_blockNumber`:** monotonically increasing counter that keeps ethers' `PollingBlockSubscriber` firing every poll interval (~4 s) rather than once per block (~12 s on Hoodi), ensuring fast receipt detection after each transaction.

## How it differs from `example-hoodi`

|                  | `example-hoodi`                         | `react-ledger`                                    |
| ---------------- | --------------------------------------- | ------------------------------------------------- |
| Wallet           | Any EIP-1193 browser extension          | Ledger hardware device (WebHID)                   |
| Relayer          | `RelayerCleartext` (no proxy needed)    | `RelayerCleartext` (no proxy needed)              |
| Network          | Hoodi (chainId 560048)                  | Hoodi (chainId 560048)                            |
| Signing          | Injected wallet (extension)             | hw-app-eth (on-device)                            |
| Chain switching  | `wallet_switchEthereumChain`            | Not applicable — chain hardcoded in provider      |
| Browser support  | Any modern browser                      | Chromium only (WebHID)                            |

## Setup

> **Network:** Hoodi testnet — chainId `560048`, default RPC `https://rpc.hoodi.ethpandaops.io`.

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

Open [http://localhost:3000](http://localhost:3000) in a Chromium-based browser, unlock your Ledger device, open the **Ethereum app**, and click **Connect Ledger**.

## Environment variables

| Variable                    | Required | Default                            | Description                                                                                                      |
| --------------------------- | -------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
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

**Via the app:** click the **Mint** button next to the ERC-20 balance — mints 10 tokens and requires a transaction confirmation on the Ledger device.

**Via Etherscan:** navigate to the contract on [hoodi.etherscan.io](https://hoodi.etherscan.io) → Write Contract → Connect Wallet → call `mint(yourLedgerAddress, amount)`.

## Tests

End-to-end tests (Playwright, no physical device required):

```bash
npx playwright install chromium  # first time only
npm run dev                       # start the app
npm run test:e2e                  # run all tests
```

See [WALKTHROUGH.md — Running tests](./WALKTHROUGH.md#running-tests) for full details on the test suites and how the Ledger device is mocked.

For a detailed guide including prerequisites, device setup, step-by-step walkthrough, and troubleshooting, see [WALKTHROUGH.md](./WALKTHROUGH.md).
