# Sepolia Confidential Token Quickstart — react-wagmi

Next.js 16 example app demonstrating how to integrate `@zama-fhe/react-sdk` with
[wagmi v3](https://wagmi.sh/) on Sepolia, against either the public Zama **testnet** or a
**custom** Zama environment you configure yourself, with wallet login through
[Privy](https://www.privy.io/).

Covers: connect wallet (Privy modal or injected), shield ERC-20 → confidential, confidential transfer, unshield, grant/revoke/use delegation, pending unshield recovery, deposit into a reacting contract (`confidentialTransferAndCall`).

## Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + **wagmi v3** + **viem v2**
- **Privy** — `@privy-io/react-auth` wallet modal (injected wallets + WalletConnect, which is how a Gnosis Safe pairs) and `@privy-io/wagmi` to mirror the active Privy wallet into wagmi
- **TanStack Query v5** for async state
- **@zama-fhe/react-sdk** (4.0.0-alpha) — `ZamaProvider`, `useConfidentialBalance`, `useUnshield`, `useConfidentialTransferAndCall`, `useDelegateDecryption`, etc.
- **@zama-fhe/react-sdk/wagmi** — `createConfig` adapter for wagmi signer/provider wiring
- **@zama-fhe/sdk/web** — browser FHE worker transport via `web()`, routed through a local Next.js proxy (`/api/relayer`)

## Setup

```bash
cp .env.example .env.local
# Testnet works out of the box. For Privy login, set NEXT_PUBLIC_PRIVY_APP_ID.
# For another Zama environment, set NEXT_PUBLIC_ZAMA_ENV=custom and the NEXT_PUBLIC_ZAMA_* values (see below).

npm install
npm run dev
```

Open [http://localhost:3004](http://localhost:3004) and connect a wallet on **Sepolia**.

- With `NEXT_PUBLIC_PRIVY_APP_ID` set, **Connect Wallet** opens Privy's wallet modal. Pick a
  browser wallet, or **WalletConnect** to pair a Gnosis Safe from the Safe web app. The
  connection is wallet-only (no Privy login or SIWE signature).
- Without it, the app falls back to wagmi's injected connector (MetaMask, Rabby, …).

If your wallet is on the wrong network, the app shows a message and offers a **Switch to Sepolia** button.

## Testnet vs a custom environment

Both run on Sepolia (chain ID 11155111). The testnet is the `sepolia` preset shipped with
the SDK. A custom environment is any other set of Zama protocol contracts, gateway chain and
relayer on Sepolia (for example a pre-release environment), described entirely by the
`NEXT_PUBLIC_ZAMA_*` variables in `.env.local`; `src/lib/config.ts` builds the `FheChain`
from them when `NEXT_PUBLIC_ZAMA_ENV=custom`. See `.env.example` for the full list.

Custom-environment caveats:

- It usually has **no wrapper registry**, so no tokens show up until you deploy your own
  wrapper pairs and a `ConfidentialTokenWrappersRegistry` against its contracts and set
  `NEXT_PUBLIC_REGISTRY_ADDRESS`. Such wrappers must be configured with the environment's
  coprocessor addresses (`FHE.setCoprocessor`), since the stock Sepolia config targets testnet.
- The ConfidentialVault defaults are testnet deployments; its cards only render when the
  bound token is selected, so they stay hidden unless you override them.

## Environment variables

| Variable                               | Required | Description                                                                                                  |
| -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_ZAMA_ENV`                 | No       | `testnet` (default) or `custom`. Selects the Zama protocol contracts, gateway and relayer on Sepolia.        |
| `NEXT_PUBLIC_ZAMA_*`                   | Custom   | Relayer URL, gateway chain ID and protocol contract addresses of the custom environment. See `.env.example`. |
| `NEXT_PUBLIC_REGISTRY_ADDRESS`         | Custom   | Wrapper registry override. Required when the environment has no registry deployment.                         |
| `NEXT_PUBLIC_PRIVY_APP_ID`             | No       | Privy app ID from the Privy dashboard. Enables the Privy wallet modal; unset = injected connector.           |
| `RELAYER_URL`                          | No       | Relayer base URL, no `/v2` suffix. Defaults to the selected environment's relayer.                           |
| `RELAYER_API_KEY`                      | No       | API key added as `x-api-key` header by the proxy. Not required for testnet.                                  |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL`          | No       | Sepolia RPC override. Defaults to the public PublicNode endpoint.                                            |
| `NEXT_PUBLIC_VAULT_ADDRESS`            | No       | `ConfidentialVault` demo address (`confidentialTransferAndCall`). Defaults to a testnet deployment.          |
| `NEXT_PUBLIC_VAULT_CONFIDENTIAL_TOKEN` | No       | Confidential token the vault is bound to (cUSDC). Vault cards render only when it is selected.               |

## Running e2e tests

```bash
npm run test:e2e        # runs Playwright (starts the dev server automatically)
```

Tests mock `window.ethereum` and the Sepolia RPC — no wallet or real network required. The
suite forces the injected-wallet stack and the testnet environment (Privy's modal cannot be
driven by a mocked provider), regardless of your `.env.local`.

## Architecture at a glance

See [WALKTHROUGH.md](WALKTHROUGH.md) for a full developer walkthrough.
